import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum PartnerStatus {
  ACTIVE   = 'active',
  INACTIVE = 'inactive',
  TESTING  = 'testing',
}

export enum PartnerCoverage {
  LOCAL       = 'local',      // same city
  INTERCITY   = 'intercity',  // between cities
  NATIONWIDE  = 'nationwide',
  REGIONAL    = 'regional',   // e.g. West Africa
}

@Entity('partners')
export class Partner {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string; // e.g. "GIG Logistics", "Kobo360", "DHL Express"

  @Column()
  slug: string; // e.g. 'gig', 'kobo360', 'dhl' — used for adapter lookup

  @Column({ type: 'enum', enum: PartnerStatus, default: PartnerStatus.TESTING })
  status: PartnerStatus;

  @Column({ type: 'enum', enum: PartnerCoverage, default: PartnerCoverage.LOCAL })
  coverage: PartnerCoverage;

  // Max package weight this partner handles (kg)
  @Column({ type: 'decimal', precision: 6, scale: 2, default: 100 })
  maxWeightKg: number;

  // API credentials (encrypted in production)
  @Column({ nullable: true })
  apiKey: string;

  @Column({ nullable: true })
  apiSecret: string;

  @Column({ nullable: true })
  apiBaseUrl: string;

  // Markup over partner's quoted price (platform adds margin)
  @Column({ type: 'decimal', precision: 4, scale: 2, default: 1.15 })
  priceMarkup: number; // 1.15 = 15% markup

  @Column({ default: true })
  isForOverflow: boolean; // used when no internal driver available

  @Column({ default: false })
  isForIntercity: boolean;

  @Column({ default: false })
  isForRural: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
