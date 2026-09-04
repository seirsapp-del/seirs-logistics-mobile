import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { StoreDropoff, DropoffStatus } from './store-dropoff.entity';
import {
  ParcelRecoveryTask, RecoveryTrigger, RecoveryStatus, RecoveryOutcome,
} from './parcel-recovery-task.entity';

/**
 * Getting other people's parcels out of a shop that is going away.
 *
 * Founder: an ops task per parcel, never auto-cancel, and the suspension
 * stays open until every one is accounted for.
 *
 * Before this, the two ways a shop could go away treated the parcels as a
 * number. adminSuspendStore suspended the shop and said nothing about them
 * at all. beginStoreClosure counted them and refused to finish while the
 * count was above zero. Neither could answer the only question that
 * matters afterwards: what happened to the third one, who decided, and
 * when.
 *
 * The distinction this service exists to hold: AN EMPTY SHELF IS NOT THE
 * SAME AS EVERY PARCEL BEING ACCOUNTED FOR. A parcel can leave a shop by
 * being collected, and it can leave by being lost. A count reaching zero
 * cannot tell those apart, and closing a shop on that basis is how a
 * missing package becomes a closed ticket.
 */
const IN_STORE: DropoffStatus[] = [
  DropoffStatus.RECEIVED_AT_STORE,
  DropoffStatus.AWAITING_DRIVER,
  DropoffStatus.DRIVER_EN_ROUTE,
  DropoffStatus.AT_DROPOFF_STORE,
  DropoffStatus.AWAITING_COLLECTION,
];

@Injectable()
export class ParcelRecoveryService {
  private readonly logger = new Logger(ParcelRecoveryService.name);

  constructor(
    @InjectRepository(ParcelRecoveryTask) private tasks: Repository<ParcelRecoveryTask>,
    @InjectRepository(StoreDropoff)       private dropoffs: Repository<StoreDropoff>,
  ) {}

  /**
   * Raise one task per parcel currently inside the shop.
   *
   * Idempotent by design rather than by luck: a shop can be suspended,
   * re-approved and suspended again, and each pass must not stack a second
   * open task on a parcel somebody is already working. Existing OPEN tasks
   * are left exactly as they are, including their notes.
   *
   * Never throws to the caller. Suspending a shop is sometimes urgent, and
   * a failure to write the follow-up paperwork must not prevent us
   * stopping a counter that needs stopping. It is logged loudly instead.
   */
  async openTasksFor(storeId: string, trigger: RecoveryTrigger): Promise<number> {
    try {
      const held = await this.dropoffs.find({
        where: [
          { pickupStoreId:  storeId, status: In(IN_STORE) },
          { dropoffStoreId: storeId, status: In(IN_STORE) },
        ],
        select: ['id', 'dropCode'] as any,
        loadEagerRelations: false,
        take: 500,
      });
      if (!held.length) return 0;

      const existing = await this.tasks.find({
        where: { partnerStoreId: storeId, status: RecoveryStatus.OPEN },
        select: ['dropoffId'] as any,
      });
      const already = new Set(existing.map(t => t.dropoffId));

      const fresh = held
        .filter(d => !already.has(d.id))
        .map(d => this.tasks.create({
          partnerStoreId: storeId,
          dropoffId:      d.id,
          dropCode:       d.dropCode ?? null,
          trigger,
          status:         RecoveryStatus.OPEN,
        }));

      if (fresh.length) await this.tasks.save(fresh);
      return fresh.length;
    } catch (e: any) {
      this.logger.error(`recovery tasks for ${storeId} failed: ${e?.message ?? e}`);
      return 0;
    }
  }

  /** How many parcels are still unaccounted for at this shop. */
  async openCount(storeId: string): Promise<number> {
    return this.tasks.count({
      where: { partnerStoreId: storeId, status: RecoveryStatus.OPEN },
    });
  }

  /**
   * The tasks, with each parcel's CURRENT status alongside.
   *
   * The live status is shown next to the task rather than used to close
   * it. If a parcel now reads collected, that is a strong hint the task is
   * done and it is still a person who says so: "the record moved" and
   * "somebody dealt with it" are different claims, and only one of them
   * survives a question six months later.
   */
  async listForStore(storeId: string) {
    const tasks = await this.tasks.find({
      where: { partnerStoreId: storeId },
      order: { status: 'ASC', createdAt: 'ASC' },
      take: 500,
    });
    if (!tasks.length) return [];

    const rows: any[] = await this.dropoffs.manager.query(
      `SELECT d."id", d."status", d."recipientName", d."recipientPhone",
              u."name" AS "senderName", u."phone" AS "senderPhone"
         FROM "store_dropoffs" d
         LEFT JOIN "users" u ON u."id" = d."senderUserId"
        WHERE d."id" = ANY($1)`,
      [tasks.map(t => t.dropoffId)],
    ).catch(() => []);
    const byId = new Map(rows.map(r => [r.id, r]));

    return tasks.map(t => {
      const d = byId.get(t.dropoffId);
      return {
        ...t,
        parcelStatus: d?.status ?? null,
        stillInStore: d ? IN_STORE.includes(d.status) : false,
        sender:    { name: d?.senderName ?? null,    phone: d?.senderPhone ?? null },
        recipient: { name: d?.recipientName ?? null, phone: d?.recipientPhone ?? null },
      };
    });
  }

  /**
   * Record what happened to one parcel.
   *
   * An outcome is required and there is no "other". Every value names a
   * real destination, including UNACCOUNTED, which exists precisely so
   * that losing a parcel has somewhere to be written down. Without it the
   * honest answer has no home and the task either stays open forever or
   * gets closed under a label that is not true.
   */
  async resolve(
    taskId: string,
    adminId: string | undefined,
    outcome: RecoveryOutcome,
    note?: string,
  ) {
    const task = await this.tasks.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException('That recovery task no longer exists.');
    if (task.status === RecoveryStatus.RESOLVED) {
      throw new BadRequestException('That parcel has already been accounted for.');
    }
    if (!Object.values(RecoveryOutcome).includes(outcome)) {
      throw new BadRequestException('Say what actually happened to the parcel.');
    }
    if (outcome === RecoveryOutcome.UNACCOUNTED && !note?.trim()) {
      // The one outcome that must never be a single click. If a parcel
      // cannot be found, what was tried belongs in the record.
      throw new BadRequestException(
        'A parcel recorded as unaccounted for needs a note saying what was checked and who was contacted.',
      );
    }

    await this.tasks.update(taskId, {
      status:            RecoveryStatus.RESOLVED,
      outcome,
      note:              note?.trim()?.slice(0, 2000) ?? null,
      resolvedByAdminId: adminId ?? null,
      resolvedAt:        new Date(),
    } as any);

    const remaining = await this.openCount(task.partnerStoreId);
    return {
      message: remaining === 0
        ? 'Every parcel at this shop is now accounted for.'
        : `Recorded. ${remaining} ${remaining === 1 ? 'parcel is' : 'parcels are'} still unaccounted for.`,
      remaining,
    };
  }
}
