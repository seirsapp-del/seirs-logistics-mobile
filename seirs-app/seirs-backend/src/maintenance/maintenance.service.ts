import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformConfig } from '../admin/platform-config.entity';

// In-memory cache so we don't hit Postgres on every guarded request.
// Refresh window is short enough that flipping maintenance_mode in the
// admin UI takes effect within ~10 seconds platform-wide.
const REFRESH_MS = 10_000;

@Injectable()
export class MaintenanceService {
  private cached = false;
  private lastCheck = 0;

  constructor(
    @InjectRepository(PlatformConfig)
    private readonly configRepo: Repository<PlatformConfig>,
  ) {}

  async isMaintenanceMode(): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastCheck < REFRESH_MS) return this.cached;
    this.lastCheck = now;
    try {
      const row = await this.configRepo.findOne({ where: { key: 'maintenance_mode' } });
      this.cached = row?.value?.toLowerCase() === 'on';
    } catch {
      // On DB error, fall back to last known value rather than locking
      // the platform out.
    }
    return this.cached;
  }
}
