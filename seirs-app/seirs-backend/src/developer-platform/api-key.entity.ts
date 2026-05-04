import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

// Spec V8 Tier 3 — Developer Platform API key. Live + test variants
// distinguished by prefix (sk_live_xxx vs sk_test_xxx). HMAC secret
// is required on every request as X-SEIRS-Signature; the key alone
// can be revealed in the dashboard but the secret is shown ONCE on
// creation and never again.
@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  ownerUserId: string;

  // Public identifier shown in dashboard, prefixed with mode
  @Index()
  @Column({ unique: true, length: 48 })
  publicKey: string;

  // bcrypt hash of the HMAC signing secret — never store raw
  @Column({ select: false })
  secretHash: string;

  // 'live' charges real money + creates real deliveries; 'test'
  // routes to the sandbox (mock drivers, fake Flutterwave).
  @Index()
  @Column({ length: 8 })
  mode: 'live' | 'test';

  @Column()
  name: string;

  // Comma-separated CIDR list — empty means no restriction
  @Column({ default: '' })
  ipAllowlist: string;

  @Column({ default: 0 })
  callsToday: number;

  @Column({ nullable: true })
  lastUsedAt: Date;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
