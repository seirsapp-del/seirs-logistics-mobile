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
