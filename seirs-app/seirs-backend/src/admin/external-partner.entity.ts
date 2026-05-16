import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, Index,
} from 'typeorm';

// Spec V8 §3.13 — external partner directory. Backs both /insurance
// and /specialists admin pages. Insurance partners are SEIRS's
// liability + cargo coverage providers; specialist partners are
// independent operators with non-standard capabilities (cold chain,
// heavy haulage, etc.).
//
// Kept as one entity with a type discriminator so the CRUD endpoints
// + admin pattern stay shared. Per-type fields go in `meta` JSONB.

export enum ExternalPartnerType {
  INSURANCE  = 'insurance',
  SPECIALIST = 'specialist',
}

export enum ExternalPartnerStatus {
  ACTIVE   = 'active',
  PENDING  = 'pending',     // submitted, awaiting verification docs
  LAPSED   = 'lapsed',      // insurance only — renewal date passed
  PAUSED   = 'paused',      // admin paused for any reason
}

@Entity('external_partners')
@Index(['type', 'status'])
export class ExternalPartner {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'enum', enum: ExternalPartnerType })
  type: ExternalPartnerType;

  @Column()
  name: string;

  @Column({ nullable: true })
  contactEmail: string;

  @Column({ nullable: true })
  contactPhone: string;

  @Column({ nullable: true })
  websiteUrl: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'enum', enum: ExternalPartnerStatus, default: ExternalPartnerStatus.PENDING })
  status: ExternalPartnerStatus;

  // Insurance-side fields (when type=INSURANCE):
  //   coverageType:     'cargo' | 'driver_accident' | 'third_party'
  //   premium:          string (human-readable, e.g. "0.5% per delivery")
  //   coverageLimitNgn: number
  //   renewalDate:      ISO date
  //   openClaims:       number
  // Specialist-side fields (when type=SPECIALIST):
  //   specialty:        string (free-form, e.g. "Cold Chain")
  //   serviceAreas:     string[] (cities)
  //   rating:           number 0-5
  //   completedJobs:    number
  @Column({ type: 'jsonb', default: () => `'{}'` })
  meta: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
