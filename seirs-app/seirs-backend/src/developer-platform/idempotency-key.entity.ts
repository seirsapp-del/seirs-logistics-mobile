import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique, Index,
} from 'typeorm';

// Spec V8 Tier 3 — Idempotency-Key cache. Partners can retry a POST
// safely; if we've seen (apiKeyId, idempotencyKey) before within the
// 24h window, we replay the cached response instead of double-creating.
// Pattern matches Stripe / Paystack idempotency.
@Entity('v1_idempotency_keys')
@Unique(['apiKeyId', 'key'])
@Index(['expiresAt'])
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  apiKeyId: string;

  // The customer-supplied Idempotency-Key header (any string ≤ 80 chars).
  @Column({ length: 100 })
  key: string;

  // HTTP method + path — protects against the same key being reused
  // across different endpoints (would be a partner bug).
  @Column({ length: 128 })
  routeSignature: string;

  @Column()
  responseStatus: number;

  @Column({ type: 'jsonb' })
  responseBody: any;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
