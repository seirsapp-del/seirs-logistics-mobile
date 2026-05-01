import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum BusinessAccountStatus {
  ACTIVE   = 'active',
  SUSPENDED = 'suspended',
}

export enum BusinessTeamRole {
  OWNER      = 'owner',
  MANAGER    = 'manager',
  DISPATCHER = 'dispatcher',
  VIEWER     = 'viewer',
}

@Entity('business_accounts')
export class BusinessAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  companyName: string;

  @Column({ nullable: true })
  rcNumber: string;

  @Column()
  businessAddress: string;

  @Column({ default: BusinessAccountStatus.ACTIVE })
  status: BusinessAccountStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  walletBalance: number;

  @Column({ type: 'int', default: 0 })
  loyaltyPoints: number;

  @Column()
  ownerId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('business_team_members')
export class BusinessTeamMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  businessAccountId: string;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column({ default: BusinessTeamRole.DISPATCHER })
  teamRole: BusinessTeamRole;

  @Column({ default: 'pending' })
  status: 'active' | 'pending';

  @CreateDateColumn()
  createdAt: Date;
}
