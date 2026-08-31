import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A rider agreed to carry a specific load for a specific sender, and
 * then did not.
 *
 * Built 2026-08-31. The founder: "if the driver accept and does not
 * deliver, we should be able to ban him or her and flag it, and report
 * to the admin or any other action, because they default of a signed
 * contract."
 *
 * This is deliberately NOT the same as a driver cancellation, which
 * already has its own table, its own daily allowance and its own
 * priority penalty. Backing out of a job the pool offered you is
 * ordinary attrition. Backing out of one you were ASKED for by name,
 * answered, and let somebody pay for is a different act: the sender
 * chose that rider, waited on their answer, and paid on the strength of
 * it. The evidence is different too, so it gets its own row rather than
 * a flag on somebody else's.
 *
 * NOTHING HERE BANS ANYBODY. That is the founder's explicit instruction
 * and it is also the only defensible design: in Nigeria a rider who
 * accepted and did not deliver may have had the bike seized at a
 * checkpoint, or been in an accident, or found no fuel. That rider
 * defaults in exactly the same database row as one who could not be
 * bothered, and no threshold can tell them apart. A person can. So this
 * records, and a human decides.
 */
@Entity('agreement_breaches')
@Index(['driverId', 'createdAt'])
@Index(['reviewedAt'])
export class AgreementBreach {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  driverId: string;

  @Column({ type: 'uuid' })
  deliveryId: string;

  /** The negotiation this came from, and therefore the terms agreed. */
  @Column({ type: 'uuid', nullable: true })
  parcelRequestId: string | null;

  /** When the rider said yes. The gap to breachedAt is itself evidence. */
  @Column({ type: 'timestamptz', nullable: true })
  agreedAt: Date | null;

  /** How far the job had got: assigned, picked_up. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  stage: string | null;

  /** The reason the rider themselves gave, in their own words. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  reason: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  /** What the sender was charged, so ops can see the size of the harm. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  fareNgn: number | null;

  /**
   * How many breaches this rider had in the trailing window at the time,
   * INCLUDING this one. Frozen here rather than counted at review time,
   * because a number that changes after the fact is not evidence.
   */
  @Column({ type: 'int', default: 1 })
  strikeCount: number;

  // ── Admin review. Null until a human looks. ──────────────────────────
  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedByUserId: string | null;

  /**
   * What the human decided: excused, warned, suspended, banned, or
   * anything else ops needs. Free text on purpose. An enum here would be
   * a list of punishments written by somebody who has never met the
   * rider.
   */
  @Column({ type: 'varchar', length: 40, nullable: true })
  action: string | null;

  @Column({ type: 'text', nullable: true })
  reviewNote: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
