import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

// Spec V8 §1 — corridor pool. A PoolGroup is a chain of legs assigned
// to a single driver-trip. Sliding capacity: max 4 active legs at a
// time; when one completes the slot frees up for new insertions.
@Entity('pool_groups')
export class PoolGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  driverId: string;

  // Origin of the corridor — the first leg's pickup. New insertions
  // must lie along the line from origin → terminal.
  @Column({ type: 'decimal', precision: 10, scale: 7 })
  originLat: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  originLng: number;

  // Terminal (current furthest dropoff in the chain). Updates as
  // longer legs are inserted.
  @Column({ type: 'decimal', precision: 10, scale: 7 })
  terminalLat: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  terminalLng: number;

  // Time budget — when the trip was estimated to take initially.
  // Insertions can extend this by at most POOL_TIME_CAP_PCT (20%).
  @Column({ type: 'int', default: 0 })
  initialEtaMinutes: number;

  @Column({ type: 'int', default: 0 })
  currentEtaMinutes: number;

  @Index()
  @Column({ default: 'active' })
  status: 'active' | 'completed';

  @Column({ type: 'jsonb', default: () => "'[]'" })
  legIds: string[]; // delivery IDs in current chain

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
