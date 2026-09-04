import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * A partner shop's request to trade from a different building (2026-09-04).
 *
 * Founder: "if a partner store is moving they have to put in a request and
 * they have to go through the whole process so we can update their data, at
 * least the most important things again, just like the driver trying to
 * change his car."
 *
 * So this is deliberately modelled on DriverVehicleChange, and carries over
 * the four decisions that entity got right:
 *
 *   1. A TABLE, not columns on partner_stores. The vehicle build learned
 *      this the hard way: a pending change parked as a jsonb blob on the
 *      live row leaked every pending photo to customers through the
 *      redactor, and an approval overwrote the blob so there was no record
 *      of what was approved, by whom, on what evidence.
 *   2. The LIVE row is written only on approval. Until then the shop keeps
 *      its old address, which is the only safe default: the address decides
 *      where customers walk and riders ride.
 *   3. One pending request at a time. Two open against the same field means
 *      whichever an admin opens second silently wins.
 *   4. Re-ask what belongs to the THING that changed, never the person. A
 *      rider changing vehicle does not redo their NIN. A shop changing
 *      premises does not redo the owner's ID or the company's CAC: the
 *      person and the company have not moved. Only the four premises
 *      documents are asked again, and PARTNER_DOC_SPEC already says which
 *      by carrying reaskOn: 'premises_move'.
 *
 * WHERE IT DIVERGES, and it has to. A rider changing vehicle is not holding
 * anyone else's goods in the old car. A shop moving IS: there are parcels on
 * that shelf belonging to people who left them at an address we published.
 * That is what parcelsHeldAtRequest and stillTradingAtOld exist for, and
 * neither has an equivalent on the vehicle side.
 *
 * The new premises PHOTOS are not columns here. They go into kyc_documents
 * under ownerType 'partner_move' with this row's id as ownerId, which the
 * polymorphic store already supports with no schema change. That buys the
 * per-document review trail, the on-site location verdicts and the expiry
 * handling that the vehicle entity's five flat URL columns cannot express.
 */

export enum MoveRequestStatus {
  PENDING   = 'pending',
  APPROVED  = 'approved',
  REJECTED  = 'rejected',
  WITHDRAWN = 'withdrawn',   // the shop cancelled it before a decision
}

@Entity('partner_move_requests')
@Index(['partnerStoreId', 'status'])
export class PartnerMoveRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  partnerStoreId: string;

  @Index()
  @Column({ type: 'varchar', length: 12, default: MoveRequestStatus.PENDING })
  status: MoveRequestStatus;

  // ── Where they are going ───────────────────────────────────────────────

  @Column({ type: 'text' })
  newStoreAddress: string;

  /**
   * The new pin, and it is NOT nullable in practice: the request is refused
   * without it.
   *
   * An address typed by hand is the exact bug this whole feature exists to
   * close, so accepting one here would reopen it one level up. The apply
   * screen already throws a pin away the moment someone types over a picked
   * address, on the grounds that no coordinates beat wrong ones. Same rule,
   * enforced harder, because by now the shop is live and people are walking
   * to it.
   */
  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  newStoreLat: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  newStoreLng: string | null;

  /** Free text. "Rent went up", "the landlord sold the building". */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  /** The date they expect to be trading from the new place. */
  @Column({ type: 'date', nullable: true })
  movingOn: string | null;

  // ── The part a vehicle change never has to ask ─────────────────────────

  /**
   * Can they still hand parcels back at the OLD shop until this is decided?
   *
   * The rider version of this question is currentVehicleUsable, and the
   * reasoning transfers exactly: only the person asking knows the answer,
   * and the platform behaves dangerously if it guesses.
   *
   * TRUE, the default, changes nothing. They keep trading at the address we
   * published while we review the new one.
   *
   * FALSE means the shutter is already down. Then continuing to send
   * customers there is sending them to a locked door, so new drop-offs stop
   * the moment the request is filed rather than when it is approved. That is
   * not a punishment for moving, it is the only honest state: we no longer
   * have an address where this shop can be found.
   *
   * Defaults true so a row written by an older client cannot silently take a
   * trading shop off the map.
   */
  @Column({ type: 'boolean', default: true })
  stillTradingAtOld: boolean;

  /**
   * How many parcels were sitting in the shop when they asked to move.
   *
   * Snapshotted rather than counted live, because it is evidence about the
   * moment the request was made and it must not change under the reviewer as
   * parcels are collected. The live count is shown next to it in the queue.
   *
   * This is the number that decides how urgent the review is. A shop moving
   * with an empty shelf is paperwork. A shop moving with eleven parcels on
   * it is an operation.
   */
  @Column({ type: 'int', default: 0 })
  parcelsHeldAtRequest: number;

  // ── What they are leaving ──────────────────────────────────────────────
  //
  // Copied at submission so the decision is readable a year later without
  // reconstructing where the shop used to be from an audit log.

  @Column({ type: 'text', nullable: true })
  oldStoreAddress: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  oldStoreLat: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  oldStoreLng: string | null;

  // ── Review trail ───────────────────────────────────────────────────────

  /** The support ticket the shop reads the outcome in. */
  @Column({ type: 'uuid', nullable: true })
  ticketId: string | null;

  @Column({ type: 'uuid', nullable: true })
  decidedByAdminId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  decisionNote: string | null;

  /**
   * Which documents were the problem, by docId.
   *
   * Straight from the vehicle change, including the reasoning: a move is ONE
   * decision, because the shop either trades from the new building or does
   * not, so per-document statuses would model a state dispatch cannot act
   * on. But a shop told only "rejected" rephotographs everything and waits
   * another cycle, so the narrow thing they actually need, which of them to
   * redo, is carried here.
   *
   * Empty on an approval, and on a rejection that was not about the photos
   * (a pin in the wrong LGA, say). The note carries that case.
   */
  @Column({ type: 'simple-array', nullable: true })
  rejectedItems: string[] | null;

  @CreateDateColumn()
  createdAt: Date;
}
