import {
  Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan } from 'typeorm';
import { PartnerStore } from '../business/partner-store.entity';
import { StoreDropoff, DropoffStatus } from './store-dropoff.entity';
import { PartnerMoveRequest, MoveRequestStatus } from './partner-move-request.entity';
import { KycDocument } from '../kyc/kyc-document.entity';
import { PARTNER_DOC_SPEC, partnerDocSpec, docLabel } from '../kyc/kyc-labels';
import { KycDocumentsService } from '../kyc/kyc-documents.service';
import {
  PartnerDocumentsService, ACCURACY_LIMIT_M, FAR_FROM_STORE_M,
} from './partner-documents.service';
import { FeesService } from '../fees/fees.service';
import { SupportService } from '../support/support.service';
import { TicketTopic } from '../support/support-ticket.entity';

/**
 * Moving a partner shop to a different building.
 *
 * Modelled on the rider vehicle change (see partner-move-request.entity for
 * what was carried over and what had to diverge). The short version of the
 * shape: the request is a row, the live shop is untouched until an admin
 * approves, and only the premises documents are asked for again.
 */

/** The documents that are about the BUILDING, so the building changing re-asks them. */
export const PREMISES_DOCS = PARTNER_DOC_SPEC
  .filter(d => d.reaskOn === 'premises_move')
  .map(d => d.docId);

/** Required premises documents. The optional one may be skipped. */
const REQUIRED_PREMISES_DOCS = PARTNER_DOC_SPEC
  .filter(d => d.reaskOn === 'premises_move' && d.required)
  .map(d => d.docId);

/** Anything physically on the shelf. Narrower than capacity on purpose. */
const HELD_STATUSES = [
  DropoffStatus.RECEIVED_AT_STORE,
  DropoffStatus.AWAITING_DRIVER,
  DropoffStatus.DRIVER_EN_ROUTE,
  DropoffStatus.AT_DROPOFF_STORE,
  DropoffStatus.AWAITING_COLLECTION,
];

@Injectable()
export class PartnerMoveService {
  private readonly logger = new Logger(PartnerMoveService.name);

  constructor(
    @InjectRepository(PartnerMoveRequest) private moves: Repository<PartnerMoveRequest>,
    @InjectRepository(PartnerStore)       private stores: Repository<PartnerStore>,
    @InjectRepository(StoreDropoff)       private dropoffs: Repository<StoreDropoff>,
    @InjectRepository(KycDocument)        private docs: Repository<KycDocument>,
    private kyc: KycDocumentsService,
    private fees: FeesService,
    private support: SupportService,
  ) {}

  /** Parcels physically in this shop right now, either role. */
  private async heldCount(storeId: string): Promise<number> {
    return this.dropoffs.count({
      where: [
        { pickupStoreId:  storeId, status: In(HELD_STATUSES) },
        { dropoffStoreId: storeId, status: In(HELD_STATUSES) },
      ],
    });
  }

  /**
   * Attach a new-premises photo to the pending move.
   *
   * Written under ownerType 'partner_move' with the REQUEST id as owner, so
   * it cannot be confused with the shop's live documents and cannot reach
   * the customer directory before anyone has looked at it. The polymorphic
   * key already allows this: ownerType is a varchar(20) and 'partner_move'
   * is twelve characters, so nothing about the table had to change.
   */
  async uploadMoveDoc(
    userId: string,
    docId: string,
    url: string,
    capture?: { lat?: number; lng?: number; accuracyM?: number },
  ) {
    const store = await this.storeForUser(userId);
    const req = await this.moves.findOne({
      where: { partnerStoreId: store.id, status: MoveRequestStatus.PENDING },
    });
    if (!req) {
      throw new BadRequestException('Start a move request before sending photos of the new shop.');
    }

    const spec = partnerDocSpec(docId);
    if (!spec || spec.reaskOn !== 'premises_move') {
      throw new BadRequestException(
        `Only photos of the new premises are asked for again. Expected one of: ${PREMISES_DOCS.join(', ')}.`,
      );
    }

    const clean = String(url ?? '').trim();
    if (!/^https?:\/\//i.test(clean)) {
      throw new BadRequestException('That does not look like an uploaded file.');
    }

    // Same tolerance as the application flow: a photo that could not get a
    // fix is still accepted, and the absence is shown to the reviewer.
    const lat = Number.isFinite(capture?.lat as number) ? Number(capture!.lat) : null;
    const lng = Number.isFinite(capture?.lng as number) ? Number(capture!.lng) : null;
    const acc = Number.isFinite(capture?.accuracyM as number)
      ? Math.round(Number(capture!.accuracyM)) : null;

    const res = await this.kyc.upsert({
      ownerType:   'partner_move' as any,
      ownerId:     req.id,
      ownerUserId: store.userId,
      docId,
      url: clean,
      capturedLat:       lat,
      capturedLng:       lng,
      capturedAccuracyM: acc,
    });
    return { ...res, label: docLabel('partner_store', docId) };
  }

  /**
   * Was this photo taken at the place they say they are moving TO?
   *
   * The live document review measures against the shop's current pin. For a
   * move that is precisely the wrong question: of course the new shopfront
   * is far from the old one, that is what moving means. Measured against
   * the PROPOSED pin instead, which turns the same check back into a useful
   * one: it now catches a photo taken nowhere near the building they are
   * asking us to send customers to.
   */
  private decorate(docs: any[], lat: string | null, lng: string | null) {
    const pLat = lat != null ? Number(lat) : null;
    const pLng = lng != null ? Number(lng) : null;
    const havePin = Number.isFinite(pLat as number) && Number.isFinite(pLng as number);

    return docs.map((d) => {
      const dLat = d.capturedLat, dLng = d.capturedLng;
      const acc  = d.capturedAccuracyM as number | null;
      const located = Number.isFinite(dLat) && Number.isFinite(dLng);
      const metresFromNewStore = (located && havePin)
        ? PartnerDocumentsService.metresBetween(dLat, dLng, pLat as number, pLng as number)
        : null;
      const spec = partnerDocSpec(d.docId);
      return {
        ...d,
        label:         docLabel('partner_store', d.docId),
        required:      spec?.required ?? false,
        metresFromNewStore,
        noLocation:    !located,
        imprecise:     located && acc != null && acc > ACCURACY_LIMIT_M,
        farFromNewStore: metresFromNewStore != null && metresFromNewStore > FAR_FROM_STORE_M,
      };
    });
  }

  private async storeForUser(userId: string): Promise<PartnerStore> {
    const store = await this.stores.findOne({ where: { userId } as any });
    if (!store) throw new NotFoundException('You do not have a partner store.');
    return store;
  }

  /**
   * What the shop sees on its own move screen.
   *
   * Returns the pending request when there is one, otherwise the last
   * decision, so a shop that was refused can read why and what to redo
   * rather than being shown an empty form with no explanation.
   */
  async myMoveRequest(userId: string) {
    const store = await this.storeForUser(userId);

    const pending = await this.moves.findOne({
      where: { partnerStoreId: store.id, status: MoveRequestStatus.PENDING },
      order: { createdAt: 'DESC' },
    });

    const lastDecided = pending ? null : await this.moves.findOne({
      where: {
        partnerStoreId: store.id,
        status: In([MoveRequestStatus.REJECTED, MoveRequestStatus.APPROVED]),
      },
      order: { decidedAt: 'DESC' },
    });

    const active = pending ?? lastDecided;
    const documents = active
      ? this.decorate(await this.docs.find({
          where: { ownerType: 'partner_move' as any, ownerId: active.id },
          order: { createdAt: 'ASC' },
        }), active.newStoreLat, active.newStoreLng)
      : [];

    return {
      currentAddress: store.storeAddress,
      request: active ?? null,
      documents,
      /** Which premises documents a new request must carry. */
      requiredDocs: REQUIRED_PREMISES_DOCS,
      allPremisesDocs: PREMISES_DOCS,
      parcelsHeldNow: await this.heldCount(store.id),
    };
  }

  /**
   * File a move request.
   *
   * Everything here is a rule the vehicle change already paid for, applied
   * to premises instead of plates.
   */
  async requestMove(userId: string, body: {
    newStoreAddress?: string;
    newStoreLat?: number;
    newStoreLng?: number;
    reason?: string;
    movingOn?: string;
    stillTradingAtOld?: boolean;
  }) {
    const store = await this.storeForUser(userId);

    if (!['approved', 'active'].includes(String(store.status))) {
      throw new BadRequestException(
        'Only an approved shop can ask to move. If your application is still being reviewed, update the address on the application instead.',
      );
    }

    // One in flight at a time. Two open requests against the same field
    // means whichever an admin opens second silently wins.
    const existing = await this.moves.findOne({
      where: { partnerStoreId: store.id, status: MoveRequestStatus.PENDING },
    });
    if (existing) {
      throw new BadRequestException(
        'MOVE_PENDING: you already have a move under review. Withdraw it first if the details have changed.',
      );
    }

    const address = String(body.newStoreAddress ?? '').trim();
    if (address.length < 10) {
      throw new BadRequestException('Enter the full address of the new shop.');
    }

    /**
     * No pin, no move. This is the whole point of the feature.
     *
     * The old settings screen let a shop retype its address as free text
     * while the map pin stayed at the previous building, so customers and
     * riders kept being sent to a place the shop had left. Accepting a
     * hand-typed address here would rebuild that bug one level up.
     */
    if (body.newStoreLat == null || body.newStoreLng == null) {
      throw new BadRequestException(
        'Pick the new address from the suggestions so the map knows where your shop is. A typed address cannot be found by customers or riders.',
      );
    }

    /**
     * Cooldown, with a way through it.
     *
     * Straight from the rider rule, and the escape hatch matters for the
     * same reason. A landlord can evict a shop twice in a year, and a hard
     * lock with no route through it means a trading shop cannot tell us
     * where it is. Days come from the Fee Catalogue so this is yours to
     * move without a deploy.
     */
    const cooldownDays = Number(
      await this.fees.getValueOr('partner_move_cooldown_days', 60).catch(() => 60),
    ) || 0;

    if (cooldownDays > 0) {
      const lastApproved = await this.moves.findOne({
        where: { partnerStoreId: store.id, status: MoveRequestStatus.APPROVED },
        order: { decidedAt: 'DESC' },
      });
      const decidedAt = lastApproved?.decidedAt ?? lastApproved?.createdAt ?? null;
      if (decidedAt) {
        const cooldownMs = cooldownDays * 86_400_000;
        const elapsed = Date.now() - new Date(decidedAt).getTime();
        if (elapsed < cooldownMs) {
          const daysLeft = Math.max(1, Math.ceil((cooldownMs - elapsed) / 86_400_000));
          throw new BadRequestException(
            `MOVE_COOLDOWN: your shop moved recently, so the next move can be requested in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. ` +
            'If you have been evicted or the building is unusable, message support and they will open it for you now.',
          );
        }
      }
    }

    const held = await this.heldCount(store.id);
    const stillTrading = body.stillTradingAtOld !== false;

    const saved = await this.moves.save(this.moves.create({
      partnerStoreId:       store.id,
      status:               MoveRequestStatus.PENDING,
      newStoreAddress:      address.slice(0, 500),
      newStoreLat:          String(body.newStoreLat),
      newStoreLng:          String(body.newStoreLng),
      reason:               body.reason ? String(body.reason).trim().slice(0, 1000) : null,
      movingOn:             body.movingOn ? String(body.movingOn).slice(0, 10) : null,
      stillTradingAtOld:    stillTrading,
      parcelsHeldAtRequest: held,
      oldStoreAddress:      store.storeAddress ?? null,
      oldStoreLat:          store.storeLat  != null ? String(store.storeLat)  : null,
      oldStoreLng:          store.storeLng  != null ? String(store.storeLng) : null,
    }));

    /**
     * New drop-offs stop the moment the request is filed. ALWAYS.
     *
     * This used to happen only when the shop answered "no, I cannot trade
     * at the old address any more", which trusted a self-declared answer
     * about the future. Founder, 2026-09-04: "imagine sending a package to
     * an old store where the partner already moved out of under a short
     * notice."
     *
     * That is the right call and my original default was wrong, because
     * the two mistakes do not cost the same:
     *
     *   Pause a shop that could have kept trading  ->  a few days of lost
     *     drop-offs at one counter. Recoverable, and it costs us money we
     *     can count.
     *   Keep routing to a shop that moves out on Friday  ->  a customer's
     *     parcel is carried to an empty building, or they walk to a locked
     *     shutter holding a collection code. Not recoverable, and it costs
     *     them their package.
     *
     * A shop that intends to move has already told us its address is about
     * to stop being true. Continuing to send strangers' parcels there on
     * the strength of "I'll still be here for now" is a bet we make with
     * somebody else's property.
     *
     * What this deliberately does NOT do is stop them RELEASING parcels
     * they already hold. acceptingNew gates intake and the directory only;
     * it appears nowhere in the release path. Suspending them outright
     * would trap the very parcels this is meant to protect.
     */
    await this.stores.update(store.id, { acceptingNew: false } as any);

    await this.raiseTicket(store, saved, held).catch((e: any) =>
      this.logger.warn(`move ticket failed: ${e?.message ?? e}`));

    return {
      request: saved,
      requiredDocs: REQUIRED_PREMISES_DOCS,
      message: 'Your move request is with our team. We have paused new parcels coming to you '
        + 'until the new address is confirmed. You can still hand back any parcel you are already holding, '
        + 'and you should: those customers were told to collect them at your current address.',
    };
  }

  /**
   * Tell support, and make the parcels the headline.
   *
   * A shop moving with an empty shelf is paperwork. A shop moving while
   * holding eleven parcels is an operation with a deadline, and the number
   * is what tells the two apart at a glance.
   */
  private async raiseTicket(store: PartnerStore, req: PartnerMoveRequest, held: number) {
    if (!store.userId) return;

    const lines = [
      `${store.storeName} has asked to move to a new building.`,
      '',
      held > 0
        ? `THEY ARE HOLDING ${held} ${held === 1 ? 'PARCEL' : 'PARCELS'} RIGHT NOW. Those parcels are at the OLD address and customers were told to collect them there.`
        : 'They are holding no parcels at the moment, so nothing is stranded by this move.',
      'New drop-offs to this shop have been paused automatically. They can still hand back parcels they already hold, and they have been told to.',
      req.stillTradingAtOld
        ? 'They say they can still be reached at the old address while this is reviewed.'
        : 'THEY SAY THEY CANNOT BE REACHED AT THE OLD ADDRESS ANY MORE. Anything still on their shelf needs collecting or redirecting urgently.',
      '',
      `From: ${req.oldStoreAddress ?? 'not on file'}`,
      `To:   ${req.newStoreAddress}`,
      req.movingOn ? `They expect to be trading there from ${req.movingOn}.` : '',
      req.reason ? `Their reason: ${req.reason}` : '',
      '',
      'They have been asked to send new photos of the shop front, the storage area and the street view. The owner ID and any company papers are not re-asked: the person and the business have not changed, only the building.',
      '',
      `Shop phone: ${store.phone ?? 'not on file'}`,
    ].filter(l => l !== '');

    const ticket = await this.support.raiseSystemTicket(store.userId, {
      topic:      TicketTopic.MOVE,
      subject:    held > 0
        ? `${store.storeName} is moving while holding ${held} ${held === 1 ? 'parcel' : 'parcels'}`
        : `${store.storeName} has asked to move premises`,
      body:       lines.join('\n'),
      systemType: 'partner_move_request',
    });
    if (ticket) await this.moves.update(req.id, { ticketId: ticket.id });
  }

  /** The shop changed its mind, or got the details wrong. */
  async withdrawMove(userId: string) {
    const store = await this.storeForUser(userId);
    const pending = await this.moves.findOne({
      where: { partnerStoreId: store.id, status: MoveRequestStatus.PENDING },
    });
    if (!pending) throw new NotFoundException('You have no move request under review.');

    await this.moves.update(pending.id, {
      status:    MoveRequestStatus.WITHDRAWN,
      decidedAt: new Date(),
    } as any);

    /**
     * Withdrawing does NOT put them back on the map.
     *
     * If they told us the old shop was unusable, that is still true after
     * they cancel the paperwork: the building did not reopen because a form
     * was withdrawn. Only a person deciding the shop is trading again turns
     * drop-offs back on, which is the existing accept-incoming toggle.
     */
    return { message: 'Move request withdrawn.' };
  }

  // ── Admin ──────────────────────────────────────────────────────────────

  /**
   * Every parcel physically in a shop, with enough detail to act on each.
   *
   * Founder, 2026-09-04: "admin should have to run a full audit of all the
   * packages with them who it belong to and everything ... can they view
   * each package in detail and all its life cycle, timestamps and chain of
   * custody, every little detail."
   *
   * They could not. The partner profile showed the NUMBER 6 in a tile and
   * offered no way to learn anything about those six: not whose they were,
   * not how long they had sat there, not their codes. Every piece of that
   * existed in the database and no route returned it, so "check the parcels
   * before you approve the move" was an instruction nobody could follow.
   *
   * Columns are named one by one, including on the sender join. A relation
   * load here would pull each sender's whole User row, bank details and KYC
   * columns included, to render a name and a phone number. That exact leak
   * has been fixed repeatedly in this repo and is not being reintroduced on
   * a screen whose entire job is to be looked at.
   *
   * backupCode is deliberately absent. It and dropCode together are what
   * release a parcel to whoever holds them, and an audit screen needs to
   * identify a parcel, not to be able to collect it.
   */
  async parcelAudit(storeId: string) {
    const store = await this.stores.findOne({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Partner store not found.');

    const rows: any[] = await this.dropoffs.manager.query(
      `SELECT d."id", d."dropCode", d."status", d."mode", d."weightKg",
              d."recipientName", d."recipientPhone", d."recipientAddress",
              d."deliveryId", d."storageFeesAccruedNgn",
              -- The parcel itself, photographed when it was taken in and
              -- again when it left. On a shop that later denies holding a
              -- package, this is the picture with a timestamp on it.
              d."receivedPhotoUrl", d."collectedPhotoUrl",
              d."createdAt", d."receivedAtStoreAt", d."pickedUpByDriverAt",
              d."arrivedAtDropoffStoreAt", d."collectedAt",
              d."senderOverstayNotifiedAt",
              d."pickupStoreId", d."dropoffStoreId",
              u."name"  AS "senderName",
              u."phone" AS "senderPhone",
              u."accountId" AS "senderAccountId"
         FROM "store_dropoffs" d
         LEFT JOIN "users" u ON u."id" = d."senderUserId"
        WHERE (d."pickupStoreId" = $1 OR d."dropoffStoreId" = $1)
          AND d."status" = ANY($2)
        ORDER BY COALESCE(d."arrivedAtDropoffStoreAt", d."receivedAtStoreAt", d."createdAt") ASC`,
      [storeId, HELD_STATUSES],
    );

    if (!rows.length) return { store: { id: store.id, storeName: store.storeName }, parcels: [] };

    /**
     * The chain of custody, in one query for the whole list.
     *
     * handoff_records is keyed on deliveryId, and this is the record that
     * answers "the shop says the parcel never arrived": a named human typed
     * their own name when they took it. Fetched for every parcel at once
     * rather than per row, so a shelf of twenty parcels is two queries.
     */
    const deliveryIds = rows.map(r => r.deliveryId).filter(Boolean);
    const handoffs: any[] = deliveryIds.length
      ? await this.dropoffs.manager.query(
          `SELECT "deliveryId", "stage", "method", "signatureName",
                  "releasedByName", "signedByRole", "proofPhotoUrl",
                  "idType", "idLast4", "createdAt"
             FROM "handoff_records"
            WHERE "deliveryId" = ANY($1)
            ORDER BY "createdAt" ASC`,
          [deliveryIds],
        ).catch((e: any) => {
          this.logger.warn(`handoff lookup failed: ${e?.message ?? e}`);
          return [];
        })
      : [];

    const byDelivery = new Map<string, any[]>();
    for (const h of handoffs) {
      if (!byDelivery.has(h.deliveryId)) byDelivery.set(h.deliveryId, []);
      byDelivery.get(h.deliveryId)!.push(h);
    }

    const now = Date.now();
    const parcels = rows.map((r) => {
      const arrived = r.arrivedAtDropoffStoreAt ?? r.receivedAtStoreAt ?? null;
      const hoursHeld = arrived
        ? Math.floor((now - new Date(arrived).getTime()) / 3_600_000)
        : null;

      /**
       * The lifecycle as a list of things that actually happened, with the
       * ones that have not happened left out rather than shown as blanks.
       * A reader wants the story, not a form with empty fields.
       */
      const timeline = [
        { key: 'booked',    label: 'Booked by the sender',        at: r.createdAt },
        { key: 'received',  label: 'Taken in at the shop',        at: r.receivedAtStoreAt },
        { key: 'picked',    label: 'Collected by a rider',        at: r.pickedUpByDriverAt },
        { key: 'arrived',   label: 'Arrived at the second shop',  at: r.arrivedAtDropoffStoreAt },
        { key: 'notified',  label: 'Sender warned about storage', at: r.senderOverstayNotifiedAt },
        { key: 'collected', label: 'Collected by the recipient',  at: r.collectedAt },
      ].filter(e => !!e.at);

      return {
        id:        r.id,
        dropCode:  r.dropCode,
        status:    r.status,
        mode:      r.mode,
        weightKg:  r.weightKg,
        // Whose parcel this is, which is the question the tile could not answer.
        sender:    { name: r.senderName, phone: r.senderPhone, seirsId: r.senderAccountId },
        recipient: { name: r.recipientName, phone: r.recipientPhone, address: r.recipientAddress },
        // Which role this shop plays for this parcel. A shop can be both.
        heldAs:    r.dropoffStoreId === storeId ? 'awaiting collection here' : 'waiting for a rider',
        arrivedAt: arrived,
        hoursHeld,
        daysHeld:  hoursHeld != null ? Math.floor(hoursHeld / 24) : null,
        storageOwedNgn: Number(r.storageFeesAccruedNgn ?? 0),
        deliveryId: r.deliveryId,
        photos: [
          r.receivedPhotoUrl  ? { label: 'When it was taken in', url: r.receivedPhotoUrl }  : null,
          r.collectedPhotoUrl ? { label: 'When it was collected', url: r.collectedPhotoUrl } : null,
        ].filter(Boolean),
        timeline,
        chainOfCustody: byDelivery.get(r.deliveryId) ?? [],
      };
    });

    return {
      store: { id: store.id, storeName: store.storeName, phone: store.phone, storeAddress: store.storeAddress },
      parcels,
      total: parcels.length,
      oldestHours: parcels.reduce((m, p) => Math.max(m, p.hoursHeld ?? 0), 0),
    };
  }



  /** The queue. Oldest first: a shop waiting on this cannot plan. */
  async listPending() {
    const rows = await this.moves.find({
      where: { status: MoveRequestStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
    if (!rows.length) return [];

    const stores = await this.stores.find({
      where: { id: In(rows.map(r => r.partnerStoreId)) },
      select: ['id', 'storeName', 'phone', 'storeAddress', 'acceptingNew'] as any,
    });
    const byId = new Map(stores.map(s => [s.id, s]));

    return Promise.all(rows.map(async (r) => ({
      ...r,
      store: byId.get(r.partnerStoreId) ?? null,
      // Both numbers: what was true when they asked, and what is true now.
      // A shelf that has emptied since changes how urgent this is.
      parcelsHeldNow: await this.heldCount(r.partnerStoreId),
      documents: this.decorate(await this.docs.find({
        where: { ownerType: 'partner_move' as any, ownerId: r.id },
        order: { createdAt: 'ASC' },
      }), r.newStoreLat, r.newStoreLng),
    })));
  }

  /** One request in full, for the partner profile panel. */
  async getForStore(storeId: string) {
    const req = await this.moves.findOne({
      where: { partnerStoreId: storeId, status: MoveRequestStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
    if (!req) return null;
    return {
      ...req,
      parcelsHeldNow: await this.heldCount(storeId),
      documents: this.decorate(await this.docs.find({
        where: { ownerType: 'partner_move' as any, ownerId: req.id },
        order: { createdAt: 'ASC' },
      }), req.newStoreLat, req.newStoreLng),
    };
  }

  /**
   * Approve or refuse a move.
   *
   * Approval is the ONLY thing that writes the live shop's address and pin.
   * Everything up to this point is a proposal.
   */
  async decide(
    storeId: string,
    approve: boolean,
    opts: { adminId?: string; note?: string; rejectedItems?: string[] },
  ) {
    const req = await this.moves.findOne({
      where: { partnerStoreId: storeId, status: MoveRequestStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
    if (!req) throw new NotFoundException('No move request is waiting on a decision for this shop.');

    const store = await this.stores.findOne({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Partner store not found.');

    if (approve) {
      const submitted = await this.docs.find({
        where: { ownerType: 'partner_move' as any, ownerId: req.id },
      });
      const have = new Set(submitted.map(d => d.docId));
      const missing = REQUIRED_PREMISES_DOCS.filter(d => !have.has(d));
      if (missing.length) {
        throw new BadRequestException(
          `This shop has not sent every photo of the new premises yet. Still missing: ${missing.join(', ')}. Ask them for it rather than approving a building nobody has seen.`,
        );
      }

      /**
       * The shelf must be clear before the address changes.
       *
       * Founder, 2026-09-04: "admin should have to run a full audit of all
       * the packages with them who it belong to and everything."
       *
       * This is not bureaucracy, it is a correctness rule. Those parcels
       * are physically in the OLD building, and their owners were told to
       * collect them at the OLD address. The moment this row is approved,
       * every screen that shows this shop shows the new one: tracking,
       * the directory, the collection instructions. So approving with a
       * loaded shelf silently redirects real people away from their own
       * property, and the parcel does not move just because the record
       * did.
       *
       * The parcel list on the review panel is how the audit gets done.
       * Each one has to be collected, redirected or returned first.
       */
      const stillHeld = await this.heldCount(store.id);
      if (stillHeld > 0) {
        throw new BadRequestException(
          `This shop is still holding ${stillHeld} ${stillHeld === 1 ? 'parcel' : 'parcels'}. ` +
          'Approving now would point their owners at the new address while the parcels sit at the old one. ' +
          'Work through the parcel list on this page first: each one has to be collected, redirected or returned.',
        );
      }

      /**
       * The live shop moves, in one write.
       *
       * Address and pin together, always. Splitting them is exactly the
       * failure this feature was built to fix.
       */
      await this.stores.update(store.id, {
        storeAddress: req.newStoreAddress,
        storeLat:     req.newStoreLat,
        storeLng:     req.newStoreLng,
      } as any);

      /**
       * The new photos become the shop's real premises documents.
       *
       * Approved on arrival, deliberately, and for the same reason the
       * vehicle change syncs its documents on approval: an admin has just
       * looked at these images and pressed Approve on this screen. Making
       * them approve the same photograph twice in two places is the
       * duplicate-review problem, not diligence.
       *
       * The OLD premises documents are replaced rather than kept alongside.
       * A storefront photo of a building the shop has left is not history,
       * it is a wrong answer to "what does this shop look like", and the
       * customer directory serves exactly that field.
       */
      await this.adoptPremisesDocs(store.id, req.id, opts.adminId ?? null);

      /**
       * Back on the map, at the new address.
       *
       * Filing the request paused intake, so approving has to lift it or a
       * shop that did everything asked of it stays invisible and quietly
       * stops earning. A refusal deliberately does NOT lift it: the shop
       * told us it is leaving, and a refused move does not make that
       * untrue. Turning drop-offs back on there is a person's decision,
       * through the accept-incoming toggle that already exists.
       */
      await this.stores.update(store.id, { acceptingNew: true } as any);
    }

    await this.moves.update(req.id, {
      status:           approve ? MoveRequestStatus.APPROVED : MoveRequestStatus.REJECTED,
      decidedByAdminId: opts.adminId ?? null,
      decidedAt:        new Date(),
      decisionNote:     opts.note?.trim()?.slice(0, 2000) ?? null,
      rejectedItems:    !approve && opts.rejectedItems?.length ? opts.rejectedItems : null,
    } as any);

    return {
      message: approve
        ? `${store.storeName} now trades from the new address. Customers and riders are directed there from now on.`
        : `${store.storeName} has been told their move was not approved.`,
    };
  }

  /**
   * Move the approved premises photos onto the live shop.
   *
   * Done as delete-then-repoint rather than an upsert because
   * kyc_documents has a UNIQUE index on (ownerType, ownerId, docId): the
   * shop already has a storefront_photo row, so the incoming one cannot
   * simply have its ownerId rewritten while the old row is still there.
   */
  private async adoptPremisesDocs(storeId: string, requestId: string, adminId: string | null) {
    const incoming = await this.docs.find({
      where: { ownerType: 'partner_move' as any, ownerId: requestId },
    });
    if (!incoming.length) return;

    for (const doc of incoming) {
      await this.docs.delete({
        ownerType: 'partner_store' as any,
        ownerId:   storeId,
        docId:     doc.docId,
      });
      await this.docs.update(doc.id, {
        ownerType:  'partner_store' as any,
        ownerId:    storeId,
        status:     'approved' as any,
        reviewedAt: new Date(),
        reviewedById: adminId,
      } as any);
    }
  }
}
