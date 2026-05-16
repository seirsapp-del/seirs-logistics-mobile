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

  // Spec V8 §3.13 — admin override on the default per-key rate limit
  // (60 req/min). Null means use default. Lets ops grant a high-volume
  // partner more headroom without changing the platform-wide limit.
  @Column({ type: 'integer', nullable: true })
  rateLimitOverridePerMin: number | null;

  // Spec V8 §3.13 — set when admin suspends the owning developer
  // account (the whole organisation, not just one key). Surfaces in
  // the admin dev-accounts UI so ops can see why a key isn't firing.
  @Column({ type: 'text', nullable: true })
  suspendedReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  suspendedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
