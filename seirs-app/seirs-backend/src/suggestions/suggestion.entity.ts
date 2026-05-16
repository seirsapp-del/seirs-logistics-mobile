import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, OneToMany, Index, JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { SuggestionVote } from './suggestion-vote.entity';

export enum SuggestionStatus {
  UNDER_REVIEW = 'under_review',
  PLANNED      = 'planned',
  IN_PROGRESS  = 'in_progress',
  SHIPPED      = 'shipped',
  CLOSED       = 'closed',
}

export enum SuggestionCategory {
  UX        = 'ux',
  FEATURE   = 'feature',
  BUG       = 'bug',
  I18N      = 'i18n',
  PERF      = 'perf',
  OTHER     = 'other',
}

// Spec V8 §3.13 — customer + driver feedback/feature-request channel.
// Submitters: any authenticated user. Voters: any authenticated user
// (one vote per suggestion per user, tracked via SuggestionVote).
@Entity('suggestions')
@Index(['status', 'createdAt'])
export class Suggestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true, onDelete: 'SET NULL' })
  @JoinColumn()
  submittedBy: User | null;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'enum', enum: SuggestionCategory, default: SuggestionCategory.FEATURE })
  category: SuggestionCategory;

  @Column({ type: 'enum', enum: SuggestionStatus, default: SuggestionStatus.UNDER_REVIEW })
  status: SuggestionStatus;

  // Denormalised vote count for cheap list rendering. Maintained by
  // SuggestionsService.vote() / unvote() in the same transaction as
  // the SuggestionVote insert/delete.
  @Column({ default: 0 })
  voteCount: number;

  // Admin reply / status-change note, surfaced to the submitter.
  @Column({ type: 'text', nullable: true })
  adminReply: string;

  @OneToMany(() => SuggestionVote, v => v.suggestion)
  votes: SuggestionVote[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
