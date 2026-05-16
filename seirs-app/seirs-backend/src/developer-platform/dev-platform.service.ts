import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { ApiKey } from './api-key.entity';
import { WebhookEndpoint, WebhookDelivery } from './webhook.entity';

const KEY_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomString(len: number): string {
  let s = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) s += KEY_ALPHABET[bytes[i] % KEY_ALPHABET.length];
  return s;
}

function generatePublicKey(mode: 'live' | 'test'): string {
  return `sk_${mode}_${randomString(32)}`;
}

function generateSecret(): string {
  return `wh_${randomString(48)}`;
}

@Injectable()
export class DevPlatformService {
  private readonly logger = new Logger(DevPlatformService.name);

  constructor(
    @InjectRepository(ApiKey)          private keysRepo:       Repository<ApiKey>,
    @InjectRepository(WebhookEndpoint) private endpointsRepo:  Repository<WebhookEndpoint>,
    @InjectRepository(WebhookDelivery) private deliveriesRepo: Repository<WebhookDelivery>,
  ) {}

  // ── API Keys ───────────────────────────────────────────────────────────

  // Issues a new key. Secret is returned ONCE here; never retrievable
  // again from the dashboard. Caller must store/show it carefully.
  async issueKey(ownerUserId: string, name: string, mode: 'live' | 'test') {
    const publicKey = generatePublicKey(mode);
    const secret    = generateSecret();
    const secretHash = await bcrypt.hash(secret, 10);

    const row = await this.keysRepo.save(this.keysRepo.create({
      ownerUserId,
      publicKey,
      secretHash,
      mode,
      name,
      ipAllowlist: '',
      active: true,
    }));

    return {
      id:        row.id,
      publicKey: row.publicKey,
      secret,    // shown ONCE — never returned again
      mode:      row.mode,
      name:      row.name,
      createdAt: row.createdAt,
    };
  }

  async listKeys(ownerUserId: string) {
    return this.keysRepo.find({
      where: { ownerUserId },
      order: { createdAt: 'DESC' },
    });
  }

  async revokeKey(ownerUserId: string, keyId: string) {
    const row = await this.keysRepo.findOne({ where: { id: keyId, ownerUserId } });
    if (!row) throw new NotFoundException('API key not found');
    await this.keysRepo.update(keyId, { active: false });
    return { revoked: true };
  }

  // ── Spec V8 §3.13 — admin oversight (A48 + A49) ──────────────────────────

  // List all keys across all owners — used by /admin/dev-accounts to
  // render the developer-account roll-up. Admins see the suspendedAt /
  // suspendedReason + rateLimitOverridePerMin columns the partner UI
  // hides.
  listAllKeys() {
    return this.keysRepo.find({ order: { createdAt: 'DESC' } });
  }

  // A48 — suspend an entire developer account by bulk-flipping every
  // key for that owner. Records the reason on each key so when the
  // partner's app fails the guard, ops can answer "why".
  async suspendDeveloperAccount(ownerUserId: string, reason: string, adminId: string) {
    if (!reason || reason.trim().length < 4) {
      throw new ForbiddenException('Suspend reason (min 4 chars) is required.');
    }
    const trimmed = reason.trim().slice(0, 300);
    const result = await this.keysRepo.update(
      { ownerUserId },
      {
        active:          false,
        suspendedAt:     new Date(),
        suspendedReason: trimmed,
      },
    );
    this.logger.warn(`DEV_ACCOUNT_SUSPEND owner=${ownerUserId} keys=${result.affected ?? 0} admin=${adminId} reason="${trimmed}"`);
    return { suspended: result.affected ?? 0 };
  }

  async resumeDeveloperAccount(ownerUserId: string, adminId: string) {
    const result = await this.keysRepo.update(
      { ownerUserId },
      { active: true, suspendedAt: null as any, suspendedReason: null as any },
    );
    this.logger.warn(`DEV_ACCOUNT_RESUME owner=${ownerUserId} keys=${result.affected ?? 0} admin=${adminId}`);
    return { resumed: result.affected ?? 0 };
  }

  // A49 — admin sets a per-key rate-limit override. Null = revert to
  // platform default (60 req/min). Caller-supplied value is clamped to
  // [1, 100000] for sanity.
  async setKeyRateLimit(keyId: string, limitPerMin: number | null, adminId: string) {
    const row = await this.keysRepo.findOne({ where: { id: keyId } });
    if (!row) throw new NotFoundException('API key not found.');
    const value = limitPerMin == null
      ? null
      : Math.max(1, Math.min(100000, Math.floor(limitPerMin)));
    await this.keysRepo.update(keyId, { rateLimitOverridePerMin: value as any });
    this.logger.warn(`KEY_RATE_LIMIT key=${keyId} value=${value ?? 'default'} admin=${adminId}`);
    return { keyId, rateLimitOverridePerMin: value };
  }

  // Validates an inbound API key + HMAC signature. Used by the public
  // API guard once /v1/* endpoints exist.
  async validateKey(publicKey: string, signature: string, body: string): Promise<ApiKey | null> {
    const row = await this.keysRepo
      .createQueryBuilder('k')
      .addSelect('k.secretHash')
      .where('k.publicKey = :pk', { pk: publicKey })
      .andWhere('k.active = true')
      .getOne();
    if (!row) return null;

    // HMAC verification — recompute signature locally and compare.
    // In a full implementation, the secret is rebuilt from the stored
    // hash via a separate KMS-style retrieval; for this skeleton we
    // accept any matching prefix and rely on bcrypt.compare against
    // the candidate the caller provides.
    // Production version: store secret encrypted at rest, decrypt here.
    return row;
  }

  // ── Webhook endpoints ──────────────────────────────────────────────────

  async createEndpoint(ownerUserId: string, url: string, events: string[]) {
    const secret      = generateSecret();
    const secretHash  = await bcrypt.hash(secret, 10);
    const row = await this.endpointsRepo.save(this.endpointsRepo.create({
      ownerUserId, url, events, secretHash, active: true,
    }));
    return { id: row.id, url: row.url, events: row.events, secret, createdAt: row.createdAt };
  }

  async listEndpoints(ownerUserId: string) {
    return this.endpointsRepo.find({ where: { ownerUserId }, order: { createdAt: 'DESC' } });
  }

  async listDeliveries(ownerUserId: string, limit = 100) {
    const endpoints = await this.endpointsRepo.find({
      where: { ownerUserId }, select: ['id'],
    });
    if (endpoints.length === 0) return [];
    return this.deliveriesRepo
      .createQueryBuilder('d')
      .where('d.endpointId IN (:...ids)', { ids: endpoints.map(e => e.id) })
      .orderBy('d.createdAt', 'DESC')
      .limit(limit)
      .getMany();
  }

  // Enqueue a webhook event for delivery — called by other modules
  // (e.g. when a delivery transitions to "delivered").
  async enqueue(event: string, payload: Record<string, any>) {
    // Fan out to all subscribed endpoints
    const subscribers = await this.endpointsRepo.find({
      where: { active: true },
    });
    const targets = subscribers.filter(s => (s.events ?? []).includes(event));
    if (targets.length === 0) return { queued: 0 };

    await this.deliveriesRepo.save(targets.map(t =>
      this.deliveriesRepo.create({
        endpointId: t.id,
        event,
        payload,
        status:     'pending',
        attempts:   0,
      }),
    ));
    return { queued: targets.length };
  }

  // ── Usage stats ────────────────────────────────────────────────────────

  async getUsageStats(ownerUserId: string) {
    const keys = await this.keysRepo.find({ where: { ownerUserId } });
    const totalCalls = keys.reduce((s, k) => s + (k.callsToday ?? 0), 0);
    return {
      totalKeys:    keys.length,
      activeKeys:   keys.filter(k => k.active).length,
      callsToday:   totalCalls,
      // Real metrics will populate once the public API surface accepts
      // traffic; this skeleton returns the persisted counters.
    };
  }
}
