import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FxService implements OnModuleInit {
  private readonly logger = new Logger(FxService.name);
  private usdToNgn = 1600; // fallback until first successful fetch

  constructor(private readonly cfg: ConfigService) {}

  async onModuleInit() {
    await this.refresh();
  }

  // Refresh every 6 hours: 00:00, 06:00, 12:00, 18:00
  @Cron('0 0,6,12,18 * * *')
  async refresh() {
    const key = this.cfg.get<string>('EXCHANGE_RATE_API_KEY');
    if (!key) {
      this.logger.warn('EXCHANGE_RATE_API_KEY not set — using cached rate');
      return;
    }
    try {
      const url  = `https://v6.exchangerate-api.com/v6/${key}/latest/USD`;
      const resp = await fetch(url);
      const data = await resp.json() as { conversion_rates?: { NGN?: number } };
      const rate = data?.conversion_rates?.NGN;
      if (rate && rate > 0) {
        this.usdToNgn = rate;
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
