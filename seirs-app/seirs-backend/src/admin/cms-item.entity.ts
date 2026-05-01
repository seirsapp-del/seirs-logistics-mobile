import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum ContentType {
  BANNER    = 'banner',
  STORY     = 'story',
  PROMOTION = 'promotion',
}

export enum ContentStatus {
  DRAFT     = 'draft',
  PENDING   = 'pending',
  PUBLISHED = 'published',
  ARCHIVED  = 'archived',
}

@Entity('cms_items')
export class CmsItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  type: ContentType;

  @Column()
  title: string;

  @Column({ nullable: true, type: 'text' })
  body: string;

  @Column({ nullable: true })
  imageUrl: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: ContentStatus.DRAFT })
  status: ContentStatus;

  @Column({ nullable: true })
  createdById: string;

  @Column({ nullable: true })
  approvedById: string;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
