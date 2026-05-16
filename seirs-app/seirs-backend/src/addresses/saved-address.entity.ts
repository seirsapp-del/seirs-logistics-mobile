import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export type AddressType = 'home' | 'work' | 'other';

@Entity('saved_addresses')
export class SavedAddress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column()
  label: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'varchar', length: 16, default: 'other' })
  type: AddressType;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lat: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lng: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
