import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * A record that somebody at SEIRS actually spoke to this shop.
 *
 * From the partner onboarding plan: a video call before approval, so a
 * human has seen the premises and spoken to the person who runs it, rather
 * than approving a set of photographs that could have come from anywhere.
 *
 * TEXT ONLY. No recording, no still, no media of any kind, and that is a
 * deliberate limit rather than a thing not built yet:
 *
 *   - Recording somebody's face and their shop creates a store of personal
 *     data we would then have to protect, justify, and eventually explain
 *     the deletion policy for. The value of the call is the judgement of
 *     the person who made it, and that fits in a sentence.
 *   - A recording invites re-watching instead of deciding. What the
 *     reviewer concluded is the useful artefact; the footage is not.
 *   - Nigerian partners are frequently on metered data. Asking a
 *     shopkeeper to upload video to be allowed to work is a cost we would
 *     be imposing on the people least able to carry it.
 *
 * What the row has to survive is a question a year later: who called, when,
 * who picked up, what they saw, and what they decided. Every one of those
 * is a sentence.
 */
@Entity('partner_call_logs')
@Index(['partnerStoreId', 'createdAt'])
export class PartnerCallLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  partnerStoreId: string;

  /** When the call was arranged for. Null when it was unplanned. */
  @Column({ type: 'timestamptz', nullable: true })
  scheduledFor: Date | null;

  /**
   * When it actually happened. Null on a row logging that it did NOT.
   *
   * A call that was arranged and never connected is worth recording: three
   * of those in a row is the clearest signal a shop is not really there,
   * and a table that only holds successful calls cannot show it.
   */
  @Column({ type: 'timestamptz', nullable: true })
  calledAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  adminUserId: string | null;

  /**
   * Who was actually on the call.
   *
   * Not assumed to be the account holder, because it frequently is not: a
   * son minds the shop, a manager runs it, the owner is at another branch.
   * "I spoke to the owner" and "I spoke to whoever answered" are different
   * facts and only one of them supports an approval.
   */
  @Column({ type: 'varchar', length: 120, nullable: true })
  spokeTo: string | null;

  /** What the reviewer saw and heard, in their own words. */
  @Column({ type: 'text', nullable: true })
  observations: string | null;

  /**
   * What they concluded. Free text on purpose.
   *
   * An enum here would force a call into approve/reject before the
   * documents have been looked at, and most calls end in neither: "shelf
   * is smaller than the photo suggests, ask about capacity" is the honest
   * outcome and no dropdown holds it.
   */
  @Column({ type: 'text', nullable: true })
  decision: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
