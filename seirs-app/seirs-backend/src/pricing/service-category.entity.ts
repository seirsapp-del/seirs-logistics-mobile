import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * Service category — what the business is shipping. Drives suggested
 * vehicle, dwell time, and category surcharges. Admin-editable from the
 * dashboard. Each booking references the category by `code`.
 *
 * Defaults seeded from seirs-pricing-spec.html (v1 12 May 2026). The
 * Nigerian reviewer may adjust before launch — see /admin/service-catalog.
 */
@Entity('service_categories')
export class ServiceCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Short identifier referenced from bookings and CSV uploads. Lower-snake.
  // Examples: 'documents', 'fragile', 'live_animals', 'house_move_full'.
  @Index({ unique: true })
  @Column()
  code: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  examples: string;

  // Suggested vehicles in order of preference. Booking flow may auto-
  // upgrade to the next one when weight exceeds the lighter option.
  // e.g. ['bicycle', 'motorcycle'] for documents.
  @Column({ type: 'jsonb' })
  suggestedVehicles: string[];

  // Base dwell minutes at each stop BEFORE weight + buffer additions.
  @Column({ type: 'int' })
  setupDwellMinutes: number;

  // Percent uplift applied to subtotal (e.g. 20 for fragile +20%).
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  surchargePercent: number;

  // Safety hard-stops. When a user tries to book this category with a
  // vehicle in `blockedVehicles`, the form refuses. `warningVehicles`
  // shows a confirm dialog but allows override.
  @Column({ type: 'jsonb', nullable: true })
  safetyRules: {
    blockedVehicles?:  string[];     // hard-stop ('motorcycle' on lumber)
    warningVehicles?:  string[];     // soft-warn override allowed
    weightThresholdKg?: number;      // safety rules trigger above this
    warningCopy?:      string;       // shown in the override dialog
  } | null;

  // Admin can pause a category platform-wide (e.g. live animals during a
  // disease outbreak). Bookings can't pick paused categories.
  @Column({ default: true })
  active: boolean;

  // Display order in the picker UI.
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
