import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * A manual driver value-level change, under the two-person rule
 * (founder 2026-08-21: any admin may move any driver to any level with
 * a REQUIRED reason, and the change sits pending until a manager
 * approves it; the approver can never be the requester).
 *
 * This is the audit trail for the path that puts a 10-million-naira
 * product in a hand-picked driver's hands, so rows are append-only:
 * nothing here is ever updated except the decision fields, and nothing
 * is ever deleted.
 */
export enum LevelChangeStatus {
  PENDING  = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('driver_level_changes')
export class DriverLevelChange {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  driverId: string;

  @Column({ type: 'int' })
  fromLevel: number;

  @Column({ type: 'int' })
  toLevel: number;

  /** Required. "Why does this driver belong at that level?" */
  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'uuid' })
  requestedByAdminId: string;

  @Index()
  @Column({ type: 'varchar', length: 12, default: LevelChangeStatus.PENDING })
  status: LevelChangeStatus;

  @Column({ type: 'uuid', nullable: true })
  decidedByAdminId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  /** Optional note from the approver/rejecter. */
  @Column({ type: 'text', nullable: true })
  decisionNote: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
