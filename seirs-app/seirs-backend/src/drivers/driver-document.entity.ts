import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { Driver } from './driver.entity';
import { User } from '../users/user.entity';

export type DriverDocStatus = 'submitted' | 'approved' | 'rejected';

/**
 * One row per KYC document a driver has uploaded, with its own review state.
 *
 * Built 2026-08-31. Before this, `updateKycDoc` wrote a URL onto a column on
 * the driver row and stopped: nothing was queued, no admin page listed
 * anything, and the driver app showed a document as "Verified" purely
 * because the DRIVER's account status was 'approved'. So an already-approved
 * driver could replace their licence with anything at all and the app would
 * call it verified, with no human ever seeing it and no way for one to.
 *
 * The URL columns on Driver are still written, because plenty of code reads
 * them. This table is the review record that sits alongside.
 */
@Entity('driver_documents')
@Index(['driverId', 'docId'], { unique: true })
@Index(['status', 'createdAt'])
export class DriverDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Driver, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;

  @Column({ name: 'driver_id', type: 'uuid' })
  driverId: string;

  /** Spec V8 §2.1 document id, e.g. national_id_front, drivers_license. */
  @Column()
  docId: string;

  @Column()
  url: string;

  @Column({ type: 'varchar', length: 20, default: 'submitted' })
  status: DriverDocStatus;

  /**
   * Why a document was refused, shown to the driver so they know what to fix
   * rather than re-uploading the same unreadable photo.
   */
  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewed_by_id' })
  reviewedBy: User | null;

  @Column({ name: 'reviewed_by_id', type: 'uuid', nullable: true })
  reviewedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  /**
   * Bumped every time the driver re-uploads. A replacement always returns to
   * 'submitted', which is the whole point: approval attaches to a specific
   * file, not to the slot it sits in.
   */
  @Column({ type: 'int', default: 1 })
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
