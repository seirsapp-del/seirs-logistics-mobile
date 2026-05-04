import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Delivery } from '../deliveries/delivery.entity';

export enum UserRole {
  CUSTOMER = 'customer',
  DRIVER   = 'driver',
  ADMIN    = 'admin',
}

export enum AdminSubRole {
  SUPER_ADMIN       = 'super_admin',
  OPS_MANAGER       = 'ops_manager',
  SUPPORT_AGENT     = 'support_agent',
  FINANCE_OFFICER   = 'finance_officer',
  DRIVER_COMPLIANCE = 'driver_compliance',
  MEDIA_CONTENT     = 'media_content',
  ANALYST           = 'analyst',
  PARTNER_MANAGER   = 'partner_manager',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Index()
  @Column({ unique: true })
  email: string;

  @Column()
  phone: string;

  @Column({ select: false })
  password: string;

  @Index()
  @Column({ type: 'enum', enum: UserRole, default: UserRole.CUSTOMER })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  fcmToken: string;

  @Column({ nullable: true })
  profilePhoto: string;

  @Column({ nullable: true, select: false })
  passwordResetToken: string;

  @Column({ nullable: true })
  passwordResetExpiry: Date;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ nullable: true, select: false })
  emailVerificationOtp: string;

  @Column({ nullable: true })
  emailVerificationExpiry: Date;

  @Column({ nullable: true, unique: true })
  googleId: string;

  @Column({ nullable: true, unique: true })
  appleId: string;

  @Index()
  @Column({ nullable: true, unique: true })
  accountId: string;

  // Spec V8 §1.13 — captured from deep-link query at registration.
  // Stored for attribution; reward fulfilment lives in a future referral module.
  @Index()
  @Column({ nullable: true })
  referredByCode: string;

  // Legacy enum-based admin sub-role. Kept for backwards compat with
  // older sessions / clients; new role assignments populate roleId
  // (Spec V8 dynamic roles) and that takes precedence.
  @Column({ nullable: true })
  adminRole: AdminSubRole;

  // Spec V8 — dynamic role assignment. FK into roles table. When set,
  // overrides the adminRole enum for permission resolution.
  @Index()
  @Column({ type: 'uuid', nullable: true })
  roleId: string;

  @Column({ nullable: true })
  businessRole: string; // 'sender' | 'partner'

  @Column({ nullable: true })
  businessAccountId: string;

  @Column({ nullable: true })
  partnerStoreId: string;

  @Column({ default: 0 })
  failedLoginAttempts: number;

  @Column({ nullable: true })
  lockedUntil: Date;

  @OneToMany(() => Delivery, (d) => d.customer)
  deliveries: Delivery[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
