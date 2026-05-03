import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FxRate } from './fx-rate.entity';

const PAIR = 'USD/NGN';
const FALLBACK_RATE = 1600;

@Injectable()
export class FxService implements OnModuleInit {
  private readonly logger = new Logger(FxService.name);
  private usdToNgn = FALLBACK_RATE;

  constructor(
    private readonly cfg: ConfigService,
    @InjectRepository(FxRate) private readonly fxRepo: Repository<FxRate>,
  ) {}

  async onModuleInit() {
    // Hydrate from the most recent persisted rate before attempting a fresh fetch.
    // This guarantees a sane rate even if the external API is unreachable on boot.
    const latest = await this.fxRepo
      .createQueryBuilder('r')
      .where('r.pair = :pair', { pair: PAIR })
      .orderBy('r.fetchedAt', 'DESC')
      .getOne()
      .catch(() => null);

    if (latest) {
      this.usdToNgn = Number(latest.rate);
      this.logger.log(`Hydrated USD/NGN from DB: ${this.usdToNgn} (fetched ${latest.fetchedAt.toISOString()})`);
    }

    await this.refresh();
  }

  // Refresh every 6 hours: 00:00, 06:00, 12:00, 18:00
  @Cron('0 0,6,12,18 * * *')
  async refresh() {
    const key = this.cfg.get<string>('EXCHANGE_RATE_API_KEY');
    if (!key) {
      this.logger.warn('EXCHANGE_RATE_API_KEY not set — using last known rate');
      return;
    }
    try {
      const url  = `https://v6.exchangerate-api.com/v6/${key}/latest/USD`;
      const resp = await fetch(url);
      const data = await resp.json() as { conversion_rates?: { NGN?: number } };
      const rate = data?.conversion_rates?.NGN;
      if (rate && rate > 0) {
        this.usdToNgn = rate;
        await this.fxRepo
          .save(this.fxRepo.create({ pair: PAIR, rate, source: 'exchangerate-api' }))
          .catch(err => this.logger.error('Failed to persist FX rate', err.message));
        this.logger.log(`USD/NGN rate updated: ${rate}`);
      }
    } catch (err) {
      this.logger.error('Failed to refresh USD/NGN rate', (err as Error).message);
    }
  }

  getUsdToNgn(): number {
    return this.usdToNgn;
  }

  ngnToUsd(ngn: number): number {
    return Math.round((ngn / this.usdToNgn) * 100) / 100;
  }
}
