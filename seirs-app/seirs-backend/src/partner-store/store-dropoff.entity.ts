import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

// Spec V8 §3 — three delivery routing modes. The classic door→door
// case lives on the existing Delivery entity unchanged; STORE_TO_DOOR
// and STORE_TO_STORE introduce store-side legs tracked here.
export enum DropoffMode {
  STORE_TO_DOOR  = 'store_to_door',
  STORE_TO_STORE = 'store_to_store',
}

// Lifecycle of a partner-store drop-off. Distinct from DeliveryStatus
// because the store leg pre-dates the driver leg — the package may sit
// at the pickup store for hours before a driver collects it.
export enum DropoffStatus {
  SCHEDULED        = 'scheduled',         // Customer booked, has not yet walked in
  RECEIVED_AT_STORE = 'received_at_store', // Partner staff scanned + photo'd the package
  AWAITING_DRIVER  = 'awaiting_driver',   // SLA window: backend will dispatch a driver
  DRIVER_EN_ROUTE  = 'driver_en_route',   // Matched, driver on way to pickup store
  IN_TRANSIT       = 'in_transit',        // Driver has the package
  AT_DROPOFF_STORE = 'at_dropoff_store',  // (STORE_TO_STORE only) waiting for recipient collection
  AWAITING_COLLECTION = 'awaiting_collection', // Recipient has been notified to come collect
  COLLECTED        = 'collected',         // Done — recipient took possession
  RETURN_TRIGGERED = 'return_triggered',  // >72hr overstay — going back to sender
  CANCELLED        = 'cancelled',         // Sender cancelled before drop or while in store
}

@Entity('store_dropoffs')
export class StoreDropoff {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Customer-facing tracking code printed on the receipt + sticker.
  @Index()
  @Column({ unique: true, length: 12 })
  dropCode: string;

  // 6-character alphanumeric backup that's typed by hand if QR scan fails.
  // Same code embedded in the QR — kept separate so we can index on it.
  @Index()
  @Column({ length: 6 })
  backupCode: string;

  @Index()
  @Column()
  senderUserId: string;

  // Pickup store — where the sender drops off
  @Index()
  @Column()
  pickupStoreId: string;

  // Final destination — either a recipient address (STORE_TO_DOOR) or
  // another partner store (STORE_TO_STORE).
  @Column({ type: 'enum', enum: DropoffMode })
  mode: DropoffMode;

  @Column({ nullable: true })
  dropoffStoreId: string; // populated for STORE_TO_STORE

  @Column({ nullable: true })
  recipientAddress: string;

  @Column({ nullable: true })
  recipientUserId: string;

  @Column({ nullable: true })
  recipientName: string;

  @Column({ nullable: true })
  recipientPhone: string;

  // Package details
  @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
  weightKg: number;

  @Column({ type: 'text', nullable: true })
  packageDescription: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  declaredValueNgn: number;

  // Store leg lifecycle
  @Index()
  @Column({ type: 'enum', enum: DropoffStatus, default: DropoffStatus.SCHEDULED })
  status: DropoffStatus;

  // Pricing — captured at booking time so quoting is stable
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  prePaidAmountNgn: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  storageFeesAccruedNgn: number;

  // Foreign reference into the regular Delivery flow once a driver is matched.
  // Null while package is still purely store-side.
  @Index()
  @Column({ nullable: true })
  deliveryId: string;

  // Timestamps for SLA tracking + storage fee window
  @Column({ nullable: true })
  receivedAtStoreAt: Date;

  @Column({ nullable: true })
  pickedUpByDriverAt: Date;

  @Column({ nullable: true })
  arrivedAtDropoffStoreAt: Date;

  @Column({ nullable: true })
  collectedAt: Date;

  // Photo evidence URLs (R2)
  @Column({ nullable: true })
  receivedPhotoUrl: string;

  @Column({ nullable: true })
  collectedPhotoUrl: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
