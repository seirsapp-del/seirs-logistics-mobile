import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, Unique,
} from 'typeorm';
import { Suggestion } from './suggestion.entity';

// One vote per (user, suggestion). Unique constraint guarantees no
// double-voting at the DB level even under concurrent requests.
@Entity('suggestion_votes')
@Unique(['userId', 'suggestion'])
export class SuggestionVote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => Suggestion, s => s.votes, { onDelete: 'CASCADE' })
  suggestion: Suggestion;

  @CreateDateColumn()
  createdAt: Date;
}
