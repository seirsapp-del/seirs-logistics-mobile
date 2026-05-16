import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable,
  Logger, UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { ApiKey } from './api-key.entity';

// Spec V8 Tier 3 — guard for the /v1/* public surface. Validates the
// API key from Authorization: Bearer sk_(live|test)_xxx, checks the
// key is active and the owning account isn't suspended, enforces a
// sliding per-key rate limit, increments callsToday + lastUsedAt on
// success, and attaches the key + mode + owner to the request so
// downstream controllers can scope queries.
//
// HMAC signature verification is deferred to v1.1 (requires migrating
// secrets from bcrypt hash to encrypted-at-rest so we can recompute
// the signature server-side). For v1 the Bearer-only path is the
// same security model as Stripe / Paystack's REST API.

export interface AuthedApiKey {
  id:           string;
  publicKey:    string;
  ownerUserId:  string;
  mode:         'live' | 'test';
  rateLimitOverridePerMin: number | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    apiKey?: AuthedApiKey;
  }
}

interface RateBucket {
  count:   number;
  windowStart: number;  // ms epoch
}

const DEFAULT_LIMIT_PER_MIN = 60;

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  // In-memory sliding-window rate limit. Per-instance — good enough
  // for single-pod deploys; for multi-pod we'd front this with Redis
  // or a token-bucket gateway. The window resets at 60s rolling.
  private readonly buckets = new Map<string, RateBucket>();

  // Tiny in-process key cache to avoid hitting Postgres on every
  // request. 60s TTL means revocations propagate within a minute,
  // matching the rate-limit window.
  private readonly keyCache = new Map<string, { key: ApiKey; cachedAt: number }>();
  private readonly KEY_CACHE_TTL_MS = 60_000;

  constructor(
    @InjectRepository(ApiKey) private readonly keysRepo: Repository<ApiKey>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = (req.headers.authorization ?? '').trim();
    if (!auth.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('Bearer API key required.');
    }
    const publicKey = auth.slice(7).trim();
    if (!/^sk_(live|test)_[a-z0-9]{16,}$/.test(publicKey)) {
      throw new UnauthorizedException('Malformed API key.');
    }

    const key = await this.lookupKey(publicKey);
    if (!key)             throw new UnauthorizedException('API key not found.');
    if (!key.active)      throw new ForbiddenException(`API key inactive${key.suspendedReason ? ` — ${key.suspendedReason}` : ''}.`);
    if (key.suspendedAt)  throw new ForbiddenException(`Developer account suspended${key.suspendedReason ? ` — ${key.suspendedReason}` : ''}.`);

    // Per-key sliding-window rate limit
    const limit = key.rateLimitOverridePerMin ?? DEFAULT_LIMIT_PER_MIN;
    this.enforceRate(key.id, limit);

    // Increment usage counter — fire-and-forget so it doesn't slow
    // the request. callsToday is reset at midnight by an admin/cron
    // (TODO: add that cron — for v1 the counter monotonically grows
    // since last manual reset, which is fine for "calls today" so
    // long as the dashboard shows "since last reset").
    this.keysRepo.update(key.id, {
      callsToday: () => `"callsToday" + 1` as any,
      lastUsedAt: new Date(),
    }).catch(() => {});

    req.apiKey = {
      id:           key.id,
      publicKey:    key.publicKey,
      ownerUserId:  key.ownerUserId,
      mode:         key.mode,
      rateLimitOverridePerMin: key.rateLimitOverridePerMin,
    };
    return true;
  }

  private async lookupKey(publicKey: string): Promise<ApiKey | null> {
    const cached = this.keyCache.get(publicKey);
    if (cached && Date.now() - cached.cachedAt < this.KEY_CACHE_TTL_MS) {
      return cached.key;
    }
    const key = await this.keysRepo.findOne({ where: { publicKey } });
    if (key) this.keyCache.set(publicKey, { key, cachedAt: Date.now() });
    return key ?? null;
  }

  private enforceRate(keyId: string, limit: number) {
    const now = Date.now();
    const bucket = this.buckets.get(keyId);
    if (!bucket || now - bucket.windowStart >= 60_000) {
      this.buckets.set(keyId, { count: 1, windowStart: now });
      return;
    }
    bucket.count++;
    if (bucket.count > limit) {
      const retryAfterSec = Math.ceil((bucket.windowStart + 60_000 - now) / 1000);
      throw new ForbiddenException(
        `RATE_LIMITED: ${limit} req/min exceeded. Retry in ${retryAfterSec}s.`,
      );
    }
  }
}
