import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Delivery } from './delivery.entity';

/**
 * Append-only event log per delivery. This is the DHL-side of SEIRS
 * tracking. Every meaningful thing that happens to a delivery (status
 * change, partner handoff scan, driver photo, admin note, geo ping)
 * gets one row here.
 *
 * Design goals:
 *   - Cheap writes: single INSERT, no locks, no cascades.
 *   - Cheap reads: composite index on (deliveryId, createdAt) so the
 *     tracking timeline is a single indexed scan.
 *   - Flexible payload: `meta` is jsonb so we can add new event types
 *     without a migration for each one.
 *   - Actor-aware: `actorRole` lets us render "Driver marked pickup"
 *     vs "Admin cancelled" vs "System routed" in the UI.
 *
 * Read path: GET /api/v1/deliveries/track/:code returns the delivery
 * with its event log baked in. That endpoint is public (no auth) so
 * both the mobile tracking screen AND the public tracking web page
 * (share.seirs.app/{code}) can consume it.
 */
export enum DeliveryEventType {
  // Status transitions. `meta.fromStatus` and `meta.toStatus` are set.
  STATUS_CHANGE = 'status_change',

  // Physical hand-off events. Used for the partner-store-async scenario
  // where a package moves through multiple partner locations. `meta`
  // carries { fromParty, toParty, partnerLocationId?, code? }.
  HANDOFF = 'handoff',

  // A driver added a note or a photo to the delivery. `meta.text` or
  // `meta.photoUrl` set.
  DRIVER_NOTE = 'driver_note',

  // An admin added a note (support intervention). `meta.text` set,
  // `actor` = admin user id.
  ADMIN_NOTE = 'admin_note',

  // Barcode/QR scan event. `meta.scannedBy` = user id, `meta.at` = short
  // location label ("customer_door", "partner_counter"). This is the
  // fraud-prevention scan at last-mile drop (customer's QR shown to
  // driver + scanned to confirm the right package).
  SCAN = 'scan',

  // Proof-of-delivery photo was added. `meta.photoUrl` set.
  PHOTO_ADDED = 'photo_added',
}

export enum EventActorRole {
  SYSTEM   = 'system',    // auto-inserted by the platform
  DRIVER   = 'driver',
  CUSTOMER = 'customer',
  ADMIN    = 'admin',
  PARTNER  = 'partner',
}

@Entity('delivery_events')
@Index(['delivery', 'createdAt'])
export class DeliveryEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Delivery, { onDelete: 'CASCADE' })
  @JoinColumn()
  delivery: Delivery;

  @Column({ type: 'varchar', length: 32 })
  type: DeliveryEventType;

  @Column({ type: 'varchar', length: 16 })
  actorRole: EventActorRole;

  // User id of whoever caused the event. Nullable for system events.
  // Kept as a plain uuid column (not FK) so deleting a user does NOT
  // cascade into event-log corruption.
  @Column({ type: 'uuid', nullable: true })
  actorUserId: string | null;

  // Optional short human-readable description. Falls back to i18n key
  // lookup on the client. Kept plain text so admin-added notes render
  // as-is without a lookup.
  @Column({ type: 'text', nullable: true })
  description: string | null;

  // Optional geo. Populated for scans, handoffs, driver-marked pickups
  // when we have a location fix. Numeric(9,6) is enough precision (~11cm).
  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true })
  lat: string | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true })
  lng: string | null;

  // Flexible payload. Keeps event evolution cheap: adding a new event
  // subtype needs no migration, just a new key in `meta`.
  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;
}
