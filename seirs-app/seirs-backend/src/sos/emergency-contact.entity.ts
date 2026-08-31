import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * One row of the emergency directory the SOS screens dial from.
 *
 * Built 2026-08-31. Both apps were written against
 * GET /config/emergency-contacts and the endpoint never existed: no
 * controller, no entity, no admin screen. The customer app therefore ran
 * permanently on its two-number offline fallback, and the driver app had
 * a hardcoded list that was simply wrong, labelling 199 as "Police" when
 * 199 is the fire service.
 *
 * The reason this is a table and not a constant is the reason the
 * customer app already gave: a wrong number on this screen is the most
 * dangerous string in the product, and correcting one must never wait
 * for an app release and a store review.
 */
@Entity('emergency_contacts')
export class EmergencyContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** What the caller is reaching, e.g. "Fire Service". */
  @Column({ type: 'varchar', length: 80 })
  name: string;

  /**
   * Every number that reaches this service, in dial order.
   *
   * A list rather than one string because Nigerian services genuinely
   * have several: a national line and a state line that both work, and
   * whichever connects is the right one when somebody is in trouble.
   */
  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  numbers: string[];

  /** When to dial it, in the caller's words. Shown under the name. */
  @Column({ type: 'text', default: '' })
  instruction: string;

  /**
   * Drives the icon in both apps. The apps fall back to a plain phone
   * glyph on an unknown category rather than guessing, because an icon
   * that implies the wrong service is the same bug as a wrong number.
   */
  @Column({ type: 'varchar', length: 30, nullable: true })
  category: string | null;

  /** Ascending. The national line belongs at the top. */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  /**
   * Retired rather than deleted, so a number that turns out to be wrong
   * leaves a trail instead of vanishing from history.
   */
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
