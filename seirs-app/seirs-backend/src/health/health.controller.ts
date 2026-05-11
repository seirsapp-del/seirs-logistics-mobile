import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators/public.decorator';

/**
 * GET /api/v1/health — public liveness + readiness probe.
 *
 * Returns 200 with diagnostic JSON. Used by:
 *   - Railway healthcheck (set HEALTHCHECK_PATH=/api/v1/health in service settings)
 *   - Admin dashboard health page (`adm.healthDash`)
 *   - Manual `curl` smoke tests
 *
 * Database round-trip is best-effort — a 500 here means TypeORM can't talk
 * to Postgres, which is the most common reason for production outages
 * (Railway database restart, exhausted connection pool, etc.).
 */
@Controller('health')
export class HealthController {
  private readonly bootedAt = new Date();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  async check() {
    const now = new Date();
    let dbOk = false;
    let dbError: string | undefined;
    try {
      // Cheapest possible query — no table access, just a round-trip.
      await this.dataSource.query('SELECT 1');
      dbOk = true;
    } catch (err: any) {
      dbError = err?.message ?? 'unknown';
    }

    return {
      status:    dbOk ? 'ok' : 'degraded',
      timestamp: now.toISOString(),
      uptimeSec: Math.floor((now.getTime() - this.bootedAt.getTime()) / 1000),
      version:   process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
      env:       process.env.NODE_ENV ?? 'development',
      db:        { reachable: dbOk, ...(dbError ? { error: dbError } : {}) },
    };
  }
}
