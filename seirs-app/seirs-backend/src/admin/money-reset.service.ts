import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Wipe every naira that was never really paid.
 *
 * The platform is going into a live money test: the founder puts a real
 * card in, we watch the charge land, and we follow each cut to the
 * driver and the partner (founder 2026-08-18). None of that is readable
 * with seeded balances sitting in the same tables, and a seeded balance
 * that looks like revenue is exactly the thing you do not want to carry
 * into launch.
 *
 * So this clears the ledgers rather than the accounts: the demo people,
 * their store and their vehicle survive and stay usable, but every
 * payment row, wallet balance, earning, payout and loyalty point goes.
 *
 * Runs dry by default and just counts. Nothing is deleted until it is
 * called with confirm, because this is production.
 */
@Injectable()
export class MoneyResetService {
  private readonly logger = new Logger(MoneyResetService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Rows that hold money. Order matters on delete: children first, so a
   * foreign key never blocks the wipe halfway through.
   */
  private readonly targets: Array<{ table: string; label: string }> = [
    { table: 'loyalty_points',               label: 'Loyalty point entries' },
    { table: 'driver_earnings',              label: 'Driver earning rows' },
    { table: 'partner_payouts',              label: 'Partner payout rows' },
    { table: 'business_wallet_transactions', label: 'Business wallet transactions' },
    { table: 'payments',                     label: 'Payment rows' },
  ];

  async run(confirm: boolean) {
    const counted: Record<string, number> = {};

    for (const t of this.targets) {
      counted[t.label] = await this.count(t.table);
    }
    counted['Wallets holding a balance'] = await this.count('wallets', '"balanceKobo" <> 0');
    counted['Deliveries with a price']   = await this.count('deliveries', '"price" > 0');
    counted['Drop-offs with a fare']     = await this.count('store_dropoffs', '"prePaidAmountNgn" > 0');

    if (!confirm) {
      return {
        dryRun: true,
        note: 'Nothing was deleted. Call again with confirm=true to wipe these.',
        counted,
      };
    }

    const done: string[] = [];
    for (const t of this.targets) {
      await this.exec(`DELETE FROM "${t.table}"`, done);
    }
    // Balances and counters are zeroed rather than deleted: the wallet
    // and the user must survive, only the money in them goes.
    // A user's point total is the sum of the loyalty_points ledger, not
    // a column on the user, so clearing the ledger above is the whole
    // job. The dry run asking users for a loyaltyPoints column is what
    // showed that.
    await this.exec(`UPDATE "wallets" SET "balanceKobo" = 0`, done);
    await this.exec(
      `UPDATE "store_dropoffs" SET "prePaidAmountNgn" = 0, "partnerHandlingNgn" = 0,
              "driverEarningsNgn" = 0, "topUpOwedNgn" = 0, "paidAt" = NULL, "topUpPaidAt" = NULL`,
      done,
    );

    this.logger.warn(`Demo money wiped: ${done.join(', ')}`);
    return { dryRun: false, wiped: done, counted };
  }

  private async count(table: string, where?: string): Promise<number> {
    try {
      const r = await this.ds.query(
        `SELECT COUNT(*)::int AS n FROM "${table}"${where ? ` WHERE ${where}` : ''}`,
      );
      return Number(r?.[0]?.n ?? 0);
    } catch (e: any) {
      this.logger.warn(`count failed for ${table}: ${e?.message ?? e}`);
      return -1;
    }
  }

  /** Each statement stands alone: one failure must not skip the rest. */
  private async exec(sql: string, done: string[]): Promise<void> {
    const label = sql.trim().split(/\s+/).slice(0, 3).join(' ');
    try {
      await this.ds.query(sql);
      done.push(`${label} ok`);
    } catch (e: any) {
      this.logger.error(`money reset FAILED [${label}]: ${e?.message ?? e}`);
      done.push(`${label} FAILED`);
    }
  }
}
