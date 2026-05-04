import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { GpsPing } from './gps-ping.entity';

interface PingInput {
  lat:        number;
  lng:        number;
  recordedAt: string; // ISO timestamp from device clock
  deliveryId?: string;
  accuracyM?: number;
}

@Injectable()
export class OfflineSyncService {
  private readonly logger = new Logger(OfflineSyncService.name);

  constructor(
    @InjectRepository(GpsPing) private repo: Repository<GpsPing>,
  ) {}

  // Bulk-insert a batch of GPS pings from the driver app. Marks them
  // wasOffline=true if the recordedAt is older than 90 seconds from
  // server time (indicates queue-and-flush behaviour).
  async receiveBatch(driverId: string, pings: PingInput[]): Promise<{ accepted: number; rejected: number }> {
    if (!Array.isArray(pings) || pings.length === 0) {
      return { accepted: 0, rejected: 0 };
    }

    const now = Date.now();
    const rows: GpsPing[] = [];
    let rejected = 0;
    for (const p of pings) {
      if (
        typeof p.lat !== 'number' || typeof p.lng !== 'number' ||
        p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180
      ) { rejected++; continue; }

      const recorded = new Date(p.recordedAt);
      if (isNaN(recorded.getTime()) || recorded.getTime() > now + 60_000) {
        // Reject obvious clock-skew (>1min in the future)
        rejected++; continue;
      }

      rows.push(this.repo.create({
        driverId,
        deliveryId: p.deliveryId ?? null,
        lat:        p.lat,
        lng:        p.lng,
        recordedAt: recorded,
        accuracyM:  p.accuracyM ?? null,
        wasOffline: now - recorded.getTime() > 90_000,
      }));
    }

    if (rows.length > 0) {
      await this.repo.save(rows);
    }
    this.logger.log(`Driver ${driverId} batch: accepted=${rows.length} rejected=${rejected}`);
    return { accepted: rows.length, rejected };
  }

  // Reconstruct a delivery's GPS trail from stored pings — used by
  // the customer trip-progress timeline and admin disputes view.
  async getTrail(deliveryId: string, since?: Date) {
    const where: any = { deliveryId };
    if (since) where.recordedAt = Between(since, new Date());
    return this.repo.find({
      where,
      order: { recordedAt: 'ASC' },
      take:  1000,
    });
  }

  async getDriverTrail(driverId: string, sinceMin = 60) {
    const since = new Date(Date.now() - sinceMin * 60_000);
    return this.repo.find({
      where: { driverId, recordedAt: Between(since, new Date()) },
      order: { recordedAt: 'ASC' },
      take:  500,
    });
  }
}
