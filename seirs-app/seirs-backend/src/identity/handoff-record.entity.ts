import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

// Verification methods tracked for audit per Spec V8 §1.17.
//
// Ordered strongest to weakest on purpose. A dispute reader has to be
// able to tell at a glance how hard the identity behind a signature was
// checked, and the high-value DELIVERED gate in DeliveriesService names
// the two strong ones explicitly rather than accepting any record.
export enum HandoffMethod {
  PHYSICAL_ID = 'physical_id',  // ID document + email OTP - primary path
  SEIRS_ID    = 'seirs_id',     // SEIRS Verified ID + typed-name signature - backup for recipients without ID

  /**
   * A named human, signed in to SEIRS, typed their own full name against
   * a scanned package code (2026-08-25).
   *
   * Symptom this exists for: the liability matrix moves responsibility on
   * scan events, and a scan on its own is a store id and a timestamp. The
   * founder's case is the store that later says the package never arrived,
   * and "our system logged a scan" is a weak answer to that. A typed full
   * name is a signature under Nigerian Evidence Act section 84, and the
   * name is what the sender's receipt can show.
   *
   * Weaker than the two above: it proves who was holding the SEIRS
   * session, not that anyone checked a government ID.
   */
  TYPED_SIGNATURE = 'typed_signature',

  /**
   * The driver wrote down the name of whoever took the package at the
   * door. Nothing was verified: no ID, no OTP, no signature by the person
   * named.
   *
   * It is here because the alternative was no record at all. A completed
   * door-to-door delivery used to produce an empty chain of custody, so
   * the one claim the whole product rests on had nothing behind it on the
   * commonest route we run. This is the honest bottom rung, and it is
   * labelled as such so nobody reads it as verification.
   */
  RECEIVER_NAME = 'receiver_name',
}

/**
 * Which side of the counter the signer was standing on.
 *
 * Needed because fromUserId / toUserId are bare user ids: a dispute
 * asks "was that the store's person or the rider?" and joining out to
 * find the answer breaks the moment staff leave the store.
 */
export enum HandoffRole {
  SENDER      = 'sender',
  STORE_STAFF = 'store_staff',
  DRIVER      = 'driver',
  RECIPIENT   = 'recipient',
}

/**
 * Where the name on the record came from.
 *
 * TYPED is a person deliberately entering their own name. ACCOUNT is the
 * server falling back to the registered name on the signed-in account
 * because the app build in the field has not been updated to ask for a
 * signature yet. Both put a named human on the record, which is the point,
 * but they are not the same evidence and the record must not pretend they
 * are.
 */
export enum SignatureSource {
  TYPED   = 'typed',
  ACCOUNT = 'account',
}

// Where in the chain of custody this handoff occurred - feeds the
// liability matrix used by adm.disputes.
export enum HandoffStage {
  CUSTOMER_TO_STORE   = 'customer_to_store',
  /**
   * Sender's door to the rider (2026-08-25).
   *
   * The matrix on the founder's slide starts at the partner store because
   * that is the scenario it illustrates, but door-to-door is the route we
   * actually run most, and it had no first link at all: a completed
   * door-to-door delivery produced an empty chain. This is the PICKED_UP
   * moment, which is the scan that moves the package off the sender.
   */
  CUSTOMER_TO_DRIVER  = 'customer_to_driver',
  STORE_TO_DRIVER     = 'store_to_driver',
  DRIVER_TO_STORE     = 'driver_to_store',
  STORE_TO_RECIPIENT  = 'store_to_recipient',
  DRIVER_TO_RECIPIENT = 'driver_to_recipient',
  // Interstate relay (2026-08-09): one driver hands the package to the
  // next leg's driver directly, no store in between. Same OTP + record
  // discipline as every other stage. Full leg modelling (DeliveryLeg
  // entity) is post-launch; this stage makes the custody chain complete
  // in the meantime.
  DRIVER_TO_DRIVER    = 'driver_to_driver',
}

// Append-only chain-of-custody record. One row per successful transition.
// Failed verifications are NOT stored here (they're rate-limited at the
// service layer instead - storing failures invites a fishing oracle).
@Entity('handoff_records')
export class HandoffRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  deliveryId: string;

  @Column({ type: 'enum', enum: HandoffStage })
  stage: HandoffStage;

  @Column({ type: 'enum', enum: HandoffMethod })
  method: HandoffMethod;

  // Who handed it over (driver / partner staff)
  @Column({ nullable: true })
  fromUserId: string;

  // Who received it (recipient / driver / partner staff)
  @Column({ nullable: true })
  toUserId: string;

  /**
   * Typed full name as digital signature, Nigerian Evidence Act section 84.
   *
   * INVARIANT, settled 2026-08-25 and not to be varied per stage:
   * signatureName is ALWAYS the party TAKING custody. releasedByName
   * below is ALWAYS the party HANDING IT OVER.
   *
   * The liability matrix moves responsibility when the TAKER signs, so
   * this field is the one that discharges the previous holder. If it
   * meant "taker" on most stages and "giver" on one, then reading any
   * record would require knowing the stage before you knew what the name
   * meant, and these records are read months later by someone who was
   * not there. One meaning, no exceptions.
   *
   * The apps only ever collect ONE typed name, because there is one
   * person at the counter to type it. The service files it on whichever
   * side the STORE is standing: releasedByName on store_to_driver,
   * signatureName on driver_to_store. See verifyTypedSignature.
   */
  @Column({ nullable: true })
  signatureName: string;

  // Reference to a proof photo (R2 URL) - nullable when method bypasses photo
  @Column({ nullable: true })
  proofPhotoUrl: string;

  // For PHYSICAL_ID method: stored as last-4 only for audit, never the full ID
  @Column({ nullable: true })
  idLast4: string;

  @Column({ nullable: true })
  idType: string;

  // ── Who signed, and for whom (2026-08-25) ───────────────────────────
  //
  // Symptom: the admin Liability Disputes page said "No handoff records
  // yet for this delivery" on a delivery that had completed, and the two
  // stages that DID write a record wrote no name for the partner store at
  // all. The founder's Nigerian case is a store that receives a package
  // and later denies it. A store id cannot answer that; a named human can.

  /** Role of the party TAKING custody, which is who signatureName is. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  signedByRole: HandoffRole | null;

  /**
   * Typed full name of the party HANDING OVER.
   *
   * signatureName has always meant the taker. Releasing needs its own
   * name because the founder asked for both ends: the sender's receipt
   * should say who released the package as well as who collected it.
   */
  @Column({ type: 'varchar', length: 120, nullable: true })
  releasedByName: string | null;

  /**
   * The partner store this transition happened at, denormalised on
   * purpose. The liability matrix parks responsibility on a STORE for
   * three of its seven rows, and resolving that through the staff user's
   * current partnerStoreId gives the wrong answer once that person moves
   * shop or leaves.
   */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  partnerStoreId: string | null;

  /** Whether signatureName was typed by a person or taken from their account. */
  @Column({ type: 'varchar', length: 8, nullable: true })
  signatureSource: SignatureSource | null;

  @CreateDateColumn()
  createdAt: Date;
}
