import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

// Spec V8 §2 — every GPS ping the driver app records, including ones
// captured offline and uploaded later in batches. recordedAt is the
// device clock when the ping was taken; createdAt is the server time
// when it was received. The gap between them shows how long the
// driver was offline.
@Entity('gps_pings')
export class GpsPing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  driverId: string;

  @Index()
  @Column({ nullable: true })
  deliveryId: string;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  lat: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  lng: number;

  // Device-time of the ping (when the driver was actually at this
  // location — may be hours before createdAt if uploaded offline).
  @Index()
  @Column()
  recordedAt: Date;

  // Optional accuracy radius in meters reported by the device GPS chip.
  @Column({ type: 'int', nullable: true })
  accuracyM: number;

  // Was this ping queued offline and uploaded in a batch later?
  @Column({ default: false })
  wasOffline: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
