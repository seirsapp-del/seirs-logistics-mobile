import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * One job per parcel left inside a shop that is going away (2026-09-04).
 *
 * Founder, on suspension: an ops task per parcel, never auto-cancel, and
 * the suspension stays open until every one is accounted for.
 *
 * WHY A ROW PER PARCEL, and not a counter on the store. Suspension already
 * knew how many parcels were held: adminSuspendStore suspended the shop
 * anyway and said nothing about them, and beginStoreClosure counted them
 * and refused to finish. Both treated "6 parcels" as one fact. It is six
 * separate obligations to six different people, each needing a different
 * answer: this one the sender collects, that one moves to another counter,
 * a third goes back. A counter can only ever say whether the number
 * reached zero. It cannot say what happened to the third parcel, or who
 * decided, or when, which is exactly what somebody asks six months later.
 *
 * Deliberately NOT auto-resolved by the parcel's own status changing. A
 * parcel can leave a shop for reasons that are not recovery, and reading
 * "it is gone" as "it was dealt with" is how a lost package becomes a
 * closed ticket. A person records the outcome.
 *
 * Nothing here cancels a delivery. The founder was explicit: never
 * auto-cancel. The task is a record of a decision somebody made, not an
 * actor that makes one.
 */

export enum RecoveryTrigger {
  SUSPENSION = 'suspension',
  CLOSURE    = 'closure',
  MOVE       = 'move',
}

export enum RecoveryStatus {
  OPEN     = 'open',
  RESOLVED = 'resolved',
}

/** What actually happened to the parcel. Recorded, never inferred. */
export enum RecoveryOutcome {
  COLLECTED   = 'collected',    // the recipient came and took it
  REDIRECTED  = 'redirected',   // moved to another counter or to a door
  RETURNED    = 'returned',     // went back to the sender
  WITH_DRIVER = 'with_driver',  // a rider took it out of the shop
  UNACCOUNTED = 'unaccounted',  // nobody can find it. A real answer, and the one that must never be silent.
}

@Entity('parcel_recovery_tasks')
@Index(['partnerStoreId', 'status'])
export class ParcelRecoveryTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  partnerStoreId: string;

  @Index()
  @Column({ type: 'uuid' })
  dropoffId: string;

  /**
   * The parcel's code, copied at creation.
   *
   * Snapshotted rather than joined because this row has to stay readable
   * after the drop-off is collected, archived or deleted. A recovery
   * record that says "parcel 4f3a-..." and nothing else is no use to the
   * person holding a receipt with a code printed on it.
   */
  @Column({ type: 'varchar', length: 24, nullable: true })
  dropCode: string | null;

  @Column({ type: 'varchar', length: 12 })
  trigger: RecoveryTrigger;

  @Column({ type: 'varchar', length: 12, default: RecoveryStatus.OPEN })
  status: RecoveryStatus;

  @Column({ type: 'varchar', length: 16, nullable: true })
  outcome: RecoveryOutcome | null;

  /** What was done, in the words of whoever did it. */
  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedByAdminId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
