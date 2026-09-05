import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * A job the rate card cannot price.
 *
 * A generator that needs four men and a permit. A church pew. A cold-chain
 * box that must not go above 8 degrees. These have no fare until somebody
 * at SEIRS looks at the photographs, works out what it actually takes, and
 * writes a number down.
 *
 * THE HARD RULE, and the reason this is a separate table rather than a
 * flag on Delivery: the price engine must REFUSE to price one of these,
 * not guess. A rate card asked about a generator returns a plausible
 * number computed from distance and weight, and plausible is the dangerous
 * answer: it looks like a quote, a sender pays it, and we have committed
 * to a job at a price nobody who understood it agreed to.
 */

export enum SpecialRequestStatus {
  SUBMITTED = 'submitted',   // sender sent it, nobody has looked
  IN_REVIEW = 'in_review',   // an admin has picked it up
  QUOTED    = 'quoted',      // a price is on the table, and it expires
  ACCEPTED  = 'accepted',    // sender took the quote; a Delivery now exists
  ASSIGNED  = 'assigned',    // a rider is on it
  PAID      = 'paid',
  CONVERTED = 'converted',   // finished as a normal delivery
  DECLINED  = 'declined',    // we said no, with a reason
  ESCALATED = 'escalated',   // one admin was unsure and passed it on
  EXPIRED   = 'expired',     // a quote went stale and nobody accepted
  WITHDRAWN = 'withdrawn',   // sender changed their mind
}

/**
 * What kind of job it is.
 *
 * MEDICAL is accepted into the queue and NOT advertised as a service. The
 * insurance position is unresolved, and it collides with the standing rule
 * against promising arrival times: the one category where a person most
 * wants a guaranteed hour is the one where Lagos traffic makes a guarantee
 * a refund magnet. It is here so a request can be logged and manually
 * assessed, not so it can be sold.
 */
export enum SpecialRequestCategory {
  OVERSIZED   = 'oversized',
  HEAVY       = 'heavy',
  FRAGILE     = 'fragile',
  HAZARDOUS   = 'hazardous',
  COLD_CHAIN  = 'cold_chain',
  LIVESTOCK   = 'livestock',
  MEDICAL     = 'medical',
  RELOCATION  = 'relocation',
  OTHER       = 'other',
}

@Entity('special_requests')
@Index(['status', 'createdAt'])
export class SpecialRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Human-quotable reference. A caller reads this out on the phone. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  reference: string;

  @Index()
  @Column({ type: 'uuid' })
  senderUserId: string;

  @Index()
  @Column({ type: 'varchar', length: 12, default: SpecialRequestStatus.SUBMITTED })
  status: SpecialRequestStatus;

  @Column({ type: 'varchar', length: 16, default: SpecialRequestCategory.OTHER })
  category: SpecialRequestCategory;

  // ── What it is ─────────────────────────────────────────────────────────

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  weightKg: string | null;

  /**
   * Structured, not "2m x 1m x 1.5m" in a text box.
   *
   * Vehicle class is the first line of every quote, and a free-text
   * dimension cannot be checked against a vehicle's load bed. A number
   * that can be compared is worth more than a string that reads well.
   */
  @Column({ type: 'int', nullable: true })
  lengthCm: number | null;

  @Column({ type: 'int', nullable: true })
  widthCm: number | null;

  @Column({ type: 'int', nullable: true })
  heightCm: number | null;

  /** How many pairs of hands it takes to lift. Drives the labour line. */
  @Column({ type: 'int', nullable: true })
  liftingHands: number | null;

  @Column({ type: 'boolean', default: false })
  fragile: boolean;

  @Column({ type: 'boolean', default: false })
  hazardous: boolean;

  @Column({ type: 'boolean', default: false })
  temperatureControlled: boolean;

  /**
   * What the sender told us about timing. A NOTE, never a commitment.
   *
   * SEIRS does not promise arrival times: Lagos traffic, power cuts and
   * checkpoints make any such promise a refund magnet. This field exists
   * so ops understand the job, and every screen that shows it must label
   * it as what the sender said rather than as a deadline we accepted.
   */
  @Column({ type: 'text', nullable: true })
  timeCriticality: string | null;

  // ── Where it goes ──────────────────────────────────────────────────────

  @Column({ type: 'text' })
  pickupAddress: string;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  pickupLat: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  pickupLng: string | null;

  @Column({ type: 'text' })
  dropoffAddress: string;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  dropoffLat: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  dropoffLng: string | null;

  /** Stairs, a narrow gate, no loading bay. The things that cost time. */
  @Column({ type: 'text', nullable: true })
  accessPickup: string | null;

  @Column({ type: 'text', nullable: true })
  accessDropoff: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  pickupContactName: string | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  pickupContactPhone: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  dropoffContactName: string | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  dropoffContactPhone: string | null;

  /** R2 URLs. A quote on a job like this is guesswork without pictures. */
  @Column({ type: 'simple-array', nullable: true })
  photoUrls: string[] | null;

  // ── Our side ───────────────────────────────────────────────────────────

  /**
   * The delivery this became, once a quote was accepted.
   *
   * Null until then, and that is the whole point: nothing is bookable, and
   * no rider can be assigned, until a human has priced it.
   */
  @Column({ type: 'uuid', nullable: true })
  deliveryId: string | null;

  @Column({ type: 'uuid', nullable: true })
  assignedAdminId: string | null;

  /** Required on a decline. "No" without a reason is not an answer. */
  @Column({ type: 'text', nullable: true })
  declineReason: string | null;

  @Column({ type: 'uuid', nullable: true })
  escalatedToAdminId: string | null;

  @Column({ type: 'text', nullable: true })
  escalationNote: string | null;

  /**
   * The sender accepted our terms for a job we warned them about.
   *
   * Hazardous and oversized work carries obligations that sit with whoever
   * is moving the thing, and a person who books a generator move has told
   * us what is in the crate. This records that they were shown the terms
   * and when, which is the only version of consent worth having.
   */
  @Column({ type: 'timestamptz', nullable: true })
  liabilityAcceptedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
