import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Append-only audit log of changes to a user's editable profile fields
 * (name, phone, profilePhoto). One row per field per change.
 *
 * Written on every successful `PATCH /users/me` and by admin overrides.
 * Never mutated after insert. supports abuse review, dispute defence,
 * NDPR "you changed X to Y on date Z" answers.
 *
 * Retained on legal hold even when the user is soft-deleted (the parent
 * User cascade is intentionally NOT set so archives keep the trail).
 */
export type ProfileFieldName =
  | 'name'                    // legacy full-name (auto-derived after split rollout)
  | 'firstName'
  | 'middleName'
  | 'lastName'
  | 'dateOfBirth'
  | 'phone'
  | 'profilePhoto'
  | 'emergencyContactName'
  | 'emergencyContactPhone'
  | 'homeAddress';

@Entity('user_profile_audits')
@Index(['userId', 'field', 'createdAt'])
export class UserProfileAudit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  @Index()
  userId!: string;

  // No cascade on delete. audit trail survives account archival
  @ManyToOne(() => User, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'varchar', length: 32 })
  field!: ProfileFieldName;

  @Column({ type: 'text', nullable: true })
  oldValue!: string | null;

  @Column({ type: 'text', nullable: true })
  newValue!: string | null;

  // 'self' = user changed their own profile via the app
  // 'admin' = staff override via admin dashboard (rare; requires admin note)
  @Column({ type: 'varchar', length: 16, default: 'self' })
  actorRole!: 'self' | 'admin';

  // Populated when actorRole = 'admin'. which staff member did the override
  @Column({ type: 'varchar', length: 64, nullable: true })
  actorUserId!: string | null;

  // Optional context for abuse investigation
  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent!: string | null;

  // Populated when actorRole = 'admin'. reason recorded in audit log
  @Column({ type: 'text', nullable: true })
  adminReason!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
