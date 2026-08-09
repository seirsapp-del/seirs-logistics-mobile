import {
  Entity, PrimaryColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * Official documents delivered to a user: earnings statements, contracts,
 * policy letters, anything ops needs to put formally in a user's hands
 * (founder direction 2026-08-09: a general "Documents" hub, not only tax).
 *
 * Content is either inline `body` text (rendered in-app) or a `fileUrl`
 * (opened in the browser / downloaded). Admin-sent docs carry the sender
 * for the audit trail. The id is generated in the service so the
 * self-healed table needs no uuid default.
 */
export type UserDocumentCategory = 'statement' | 'contract' | 'letter' | 'policy' | 'other';

@Entity('user_documents')
export class UserDocument {
  @PrimaryColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 24, default: 'other' })
  category: UserDocumentCategory;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'text', nullable: true })
  fileUrl: string | null;

  @Column({ type: 'uuid', nullable: true })
  sentByAdminId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  sentByName: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
