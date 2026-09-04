import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * A rider's request to register a different vehicle (2026-08-25).
 *
 * WHY a table and not more columns on `drivers`:
 * the previous build parked the request inside `drivers.vehicleDetails`
 * as a `pendingChange` jsonb blob. Two symptoms came out of that. First,
 * `redactDriverForCustomer` hands `vehicleDetails` to the customer app
 * whole, so every R2 photo URL in a pending request was shipped to the
 * sender's phone as a side effect. Second, an approved change overwrote
 * the blob, so there was no record of what was approved, by whom, or on
 * what evidence: exactly the paperwork a compliance question needs a
 * year later.
 *
 * One row per submission, append-only in spirit. The live vehicle on the
 * `drivers` row is the only thing matching and pricing read, and it is
 * written ONLY when an admin approves a row here.
 */

export enum VehicleChangeStatus {
  PENDING    = 'pending',
  APPROVED   = 'approved',
  REJECTED   = 'rejected',
  WITHDRAWN  = 'withdrawn',   // rider cancelled it before a decision
}

/**
 * Who actually owns the vehicle the rider rides.
 *
 * Founder, 2026-08-25: "do they have to submit proof of ownership in the
 * whole KYC ... or proof of ownership by someone else and the person have
 * to give their approval that they gave the sign off that the driver can
 * use their vehicle. this is Nigeria this happens."
 *
 * A large share of okada and keke riders do not own the machine. Hire
 * purchase, a family member's bike, or an owner who fronts it for a daily
 * return are all normal. A KYC that assumes rider equals owner either
 * locks those riders out or silently accepts an unverifiable claim.
 */
export enum VehicleOwnership {
  SELF        = 'self',
  THIRD_PARTY = 'third_party',
}

/** How the rider came to be riding someone else's vehicle. */
export enum OwnerRelationship {
  FAMILY        = 'family',          // brother, uncle, spouse
  EMPLOYER      = 'employer',        // fleet or company vehicle
  HIRE_PURCHASE = 'hire_purchase',   // paying it off, title not yet theirs
  DAILY_RETURN  = 'daily_return',    // owner fronts it, rider pays a daily
  FRIEND        = 'friend',
  OTHER         = 'other',
}

@Entity('driver_vehicle_changes')
export class DriverVehicleChange {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  driverId: string;

  @Index()
  @Column({ type: 'varchar', length: 12, default: VehicleChangeStatus.PENDING })
  status: VehicleChangeStatus;

  // ── The vehicle being requested ────────────────────────────────────────

  @Column({ type: 'varchar', length: 24 })
  vehicleType: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  vehiclePlate: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  make: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  model: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  year: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  color: string | null;

  // ── The vehicle proofs, re-submitted every time ────────────────────────
  // Founder: "Look at what they currently have to submit to approve a
  // vehicle and they only have to submit it again". Identity proofs
  // (NIN, licence, selfie) are NOT here: those belong to the person and
  // an already-approved rider must not be made to redo them.

  @Column({ type: 'varchar', length: 500, nullable: true })
  photoExteriorUrl: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  photoInteriorUrl: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  photoPlateUrl: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  ownershipProofUrl: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  insuranceCertUrl: string | null;

  // ── Third-party ownership + the owner's recorded consent ───────────────

  @Column({ type: 'varchar', length: 16, default: VehicleOwnership.SELF })
  ownership: VehicleOwnership;

  @Column({ type: 'varchar', length: 120, nullable: true })
  ownerName: string | null;

  /** E.164. Reachable so compliance can call the owner and ask. */
  @Column({ type: 'varchar', length: 24, nullable: true })
  ownerPhone: string | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  ownerRelationship: OwnerRelationship | null;

  /**
   * Photo of the authorisation the owner signed by hand, on paper. The
   * owner does not need the app, an email address, or a smartphone to
   * produce this, which is the whole point: requiring the owner to
   * register would exclude most of the people this is for.
   */
  @Column({ type: 'varchar', length: 500, nullable: true })
  ownerConsentUrl: string | null;

  /** Optional. The owner's ID photo ties the paper signature to a person. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  ownerIdUrl: string | null;

  /**
   * The owner's full name, typed by the owner on the rider's phone.
   *
   * Same standard the chain-of-custody records already use: a typed full
   * name is a digital signature under Nigerian Evidence Act section 84.
   * Reusing that standard rather than inventing a second one keeps one
   * answer to "what counts as a signature here" across the platform.
   */
  @Column({ type: 'varchar', length: 120, nullable: true })
  ownerSignatureName: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  ownerConsentAt: Date | null;

  // ── Review trail ───────────────────────────────────────────────────────

  /** Support ticket opened for the review, so the rider sees the outcome. */
  @Column({ type: 'uuid', nullable: true })
  ticketId: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'uuid', nullable: true })
  decidedByAdminId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  decisionNote: string | null;

  /**
   * Which of the five documents were the problem, by slot key.
   *
   * WHY a list rather than a status per document. A vehicle change is one
   * decision: the rider either rides the new vehicle or does not, so five
   * independent statuses would model a state ("plate approved, insurance
   * rejected") that dispatch has no way to act on. What was actually
   * missing is narrower than that, and it is the only part the rider
   * needs: WHICH documents to redo. Until now one dark photo turned the
   * whole submission down with the message "Your vehicle change was
   * rejected", and a rider with five acceptable documents and one blurred
   * one had no way to learn which, so the usual response was to
   * rephotograph all five and wait another cycle.
   *
   * Empty or null on an approval, and on a rejection that was not about
   * the documents at all (a plate that does not match the papers, say).
   * The note carries that case.
   */
  @Column({ type: 'simple-array', nullable: true })
  rejectedItems: string[] | null;

  /**
   * Does the vehicle on file still work?
   *
   * The reason a rider changes vehicle is usually that the old one has
   * stopped being available: sold, stolen, written off, or back with the
   * owner it was borrowed from. Dispatch does not know that. It keeps
   * sending jobs against a plate the rider cannot produce, and a customer
   * waits at the kerb for a keke that no longer exists, then rates the
   * rider one star for it.
   *
   * Asked as one question at submission, because only the rider knows the
   * answer. TRUE, the default, changes nothing: they keep working on the
   * vehicle we approved while the new one is reviewed. FALSE stops them
   * going online until the change is decided, which is not a punishment,
   * it is the only honest state: we have no approved vehicle to dispatch.
   *
   * Defaults true so every row written before this column existed keeps
   * the behaviour it was written under.
   */
  @Column({ type: 'boolean', default: true })
  currentVehicleUsable: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
