import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

// Verification methods tracked for audit per Spec V8 §1.17.
export enum HandoffMethod {
  PHYSICAL_ID = 'physical_id',  // ID document + email OTP — primary path
  SEIRS_ID    = 'seirs_id',     // SEIRS Verified ID + typed-name signature — backup for recipients without ID
}

// Where in the chain of custody this handoff occurred — feeds the
// liability matrix used by adm.disputes.
export enum HandoffStage {
  CUSTOMER_TO_STORE   = 'customer_to_store',
  STORE_TO_DRIVER     = 'store_to_driver',
  DRIVER_TO_STORE     = 'driver_to_store',
  STORE_TO_RECIPIENT  = 'store_to_recipient',
  DRIVER_TO_RECIPIENT = 'driver_to_recipient',
}

// Append-only chain-of-custody record. One row per successful transition.
// Failed verifications are NOT stored here (they're rate-limited at the
// service layer instead — storing failures invites a fishing oracle).
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

  // Typed full name as digital signature — Nigerian Evidence Act §84
  @Column({ nullable: true })
  signatureName: string;

  // Reference to a proof photo (R2 URL) — nullable when method bypasses photo
  @Column({ nullable: true })
  proofPhotoUrl: string;

  // For PHYSICAL_ID method: stored as last-4 only for audit, never the full ID
  @Column({ nullable: true })
  idLast4: string;

  @Column({ nullable: true })
  idType: string;

  @CreateDateColumn()
  createdAt: Date;
}
