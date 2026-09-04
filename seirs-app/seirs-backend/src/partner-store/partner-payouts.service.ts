import {
  Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PartnerStore } from '../business/partner-store.entity';
import { PartnerPayout } from '../business/partner-payout.entity';
import { FlutterwaveService } from '../payments/flutterwave.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Where a counter's earnings go, and how they get there.
 *
 * Until 2026-09-03 there was no answer to either. partner_payouts held an
 * amount, a period and a status, with no destination anywhere and nothing
 * in the codebase that ever set that status to 'paid'. A shop accrued
 * handling fees into a ledger nobody could settle, while the partner
 * statement rendered "Counter earnings paid" for a state no code could
 * reach.
 *
 * Founder, 2026-09-03: applications may open and documents may be
 * reviewed, but no partner is approved until this exists, because
 * approval is the moment a shop starts earning money we would owe. Owe a
 * woman running a counter NGN 40,000.00 and fail to send it and she is
 * the person least able to absorb it, and she will tell every other shop
 * on her street.
 *
 * Deliberately the same shape as the driver rail rather than a second
 * one: the same provider transfer, the same first-account-instant and
 * replacement-reviewed policy, the same refusal to record a failed
 * transfer as a payment.
 */
@Injectable()
export class PartnerPayoutsService {
  private readonly logger = new Logger(PartnerPayoutsService.name);

  constructor(
    @InjectRepository(PartnerStore)  private readonly stores:  Repository<PartnerStore>,
    @InjectRepository(PartnerPayout) private readonly payouts: Repository<PartnerPayout>,
    @InjectDataSource()              private readonly ds:      DataSource,
    private readonly flutterwave: FlutterwaveService,
    private readonly notifications: NotificationsService,
  ) {}

  private async storeForUser(userId: string): Promise<PartnerStore> {
    const [row] = await this.ds.query(
      `SELECT "partnerStoreId" FROM users WHERE id = $1 LIMIT 1`, [userId],
    );
    if (!row?.partnerStoreId) throw new ForbiddenException('You do not run a partner store.');
    const store = await this.stores.findOne({ where: { id: row.partnerStoreId } });
    if (!store) throw new NotFoundException('Partner store not found.');
    return store;
  }

  // ── The shop's own account ─────────────────────────────────────────────

  /**
   * What a partner sees about where their money goes.
   *
   * The account number is masked. A shop owner already knows their own
   * account, so showing it in full buys nothing and costs everything if
   * somebody is looking over their shoulder in a busy market.
   */
  async myBankDetails(userId: string) {
    const store = await this.storeForUser(userId);
    const mask = (n?: string | null) =>
      n ? `${'*'.repeat(Math.max(0, n.length - 4))}${n.slice(-4)}` : null;

    return {
      hasAccount:  !!store.bankAccountNumber,
      bankName:    store.bankName ?? null,
      accountName: store.bankAccountName ?? null,
      accountNumberMasked: mask(store.bankAccountNumber),
      verifiedAt:  store.bankVerifiedAt ?? null,
      pending: store.pendingBankAccountNumber ? {
        bankName:    store.pendingBankName,
        accountName: store.pendingBankAccountName,
        accountNumberMasked: mask(store.pendingBankAccountNumber),
        requestedAt: store.pendingBankRequestedAt,
      } : null,
    };
  }

  /**
   * Save, or ask to change, where the shop is paid.
   *
   * The number is RESOLVED with the bank before it is stored, and the
   * name that gets stored is the bank's answer rather than what the
   * partner typed. People mistype their own account numbers, and a
   * transfer to a mistyped number that happens to exist is somebody
   * else's money now.
   *
   * First account saves instantly: a shop with no account cannot be paid,
   * and making them wait for a review helps nobody. REPLACING one queues
   * for a human, because that is the step an attacker wants and the live
   * account keeps paying until somebody approves the change. Same policy
   * drivers have had since 2026-08-09.
   */
  async setBankDetails(
    userId: string,
    body: { bankName: string; bankCode: string; accountNumber: string },
  ) {
    const store = await this.storeForUser(userId);

    const bankCode      = String(body?.bankCode ?? '').trim();
    const accountNumber = String(body?.accountNumber ?? '').replace(/\s/g, '');
    const bankName      = String(body?.bankName ?? '').trim();

    if (!bankCode || !bankName) throw new BadRequestException('Choose your bank.');
    if (!/^\d{10}$/.test(accountNumber)) {
      throw new BadRequestException('A Nigerian account number is 10 digits.');
    }

    /**
     * Returns { accountName } or null. Null means the provider refused to
     * resolve it, which is the answer we want: an account we cannot name
     * is one we will not send money to.
     */
    const resolved = await this.flutterwave.verifyBankAccount({ bankCode, accountNumber });
    if (!resolved?.accountName?.trim()) {
      throw new BadRequestException(
        'That account could not be confirmed with the bank. Check the number and the bank, '
        + 'then try again.',
      );
    }

    const isReplacement = !!store.bankAccountNumber;

    if (!isReplacement) {
      await this.stores.update(store.id, {
        bankName, bankCode, bankAccountNumber: accountNumber,
        bankAccountName: resolved.accountName,
        bankVerifiedAt:  new Date(),
      } as any);
      return {
        saved: true, pending: false,
        accountName: resolved.accountName,
        message: `Payouts will go to ${resolved.accountName}.`,
      };
    }

    await this.stores.update(store.id, {
      pendingBankName: bankName, pendingBankCode: bankCode,
      pendingBankAccountNumber: accountNumber,
      pendingBankAccountName:   resolved.accountName,
      pendingBankRequestedAt:   new Date(),
    } as any);

    return {
      saved: true, pending: true,
      accountName: resolved.accountName,
      message: 'We will check this change before it takes effect. '
        + 'Your earnings keep going to the current account until then.',
    };
  }

  // ── Paying ─────────────────────────────────────────────────────────────

  /**
   * Send one payout, once.
   *
   * Guarded three ways, because this is the only method in the partner
   * code that moves money out:
   *
   *   1. Already paid is refused outright.
   *   2. The reference is derived from the payout id, so a retry after a
   *      timeout reuses it rather than minting a second transfer, and a
   *      unique index refuses a duplicate even if two requests race.
   *   3. A refused transfer leaves the status 'pending' and records what
   *      the provider said. It must NEVER read as paid: four transfers
   *      were refused over IP whitelisting on 2026-08-27, and a refusal
   *      recorded as a payment is a shop told they were paid when they
   *      were not.
   */
  async payOne(payoutId: string, adminUserId: string) {
    const payout = await this.payouts.findOne({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found.');
    if (payout.status === 'paid') {
      throw new BadRequestException('This payout has already been sent.');
    }

    const store = await this.stores.findOne({ where: { id: payout.partnerStoreId } });
    if (!store) throw new NotFoundException('Partner store not found.');
    if (!store.bankAccountNumber || !store.bankCode) {
      throw new BadRequestException(
        `${store.storeName} has no bank account on file, so there is nowhere to send this.`,
      );
    }

    const amount = Number(payout.amount ?? 0);
    if (!(amount > 0)) throw new BadRequestException('There is nothing to send on this payout.');

    const reference = payout.transferReference ?? `PSPO-${payout.id}`;

    // Claim the reference before calling out, so a provider timeout
    // cannot be retried into a second transfer.
    await this.payouts.update(payout.id, {
      status: 'processing', transferReference: reference, failureReason: null,
    } as any);

    const res = await this.flutterwave.transferToBank({
      amountNaira:   amount,
      bankCode:      store.bankCode,
      accountNumber: store.bankAccountNumber,
      accountName:   store.bankAccountName ?? store.storeName,
      reference,
      narration:     `SEIRS counter earnings ${payout.period}`,
    });

    if (!res?.success) {
      const why = res?.reason ?? 'The bank refused the transfer.';
      await this.payouts.update(payout.id, {
        status: 'pending', failureReason: why,
      } as any);
      this.logger.error(
        `partner payout ${payout.id} REFUSED for ${store.storeName}: ${why}. `
        + `NGN ${amount.toFixed(2)} is still owed.`,
      );
      throw new BadRequestException(`Not sent: ${why}`);
    }

    await this.payouts.update(payout.id, {
      status: 'paid',
      paidAt: new Date(),
      paidToBankName:      store.bankName,
      paidToAccountNumber: store.bankAccountNumber,
      paidToAccountName:   store.bankAccountName,
      providerTransferId:  res.transferId ?? null,
      failureReason:       null,
    } as any);

    // Tell the shop. A payout they are not told about is one they chase.
    if (store.userId) {
      this.notifications.create(
        store.userId,
        'Your counter earnings have been sent',
        `NGN ${amount.toFixed(2)} for ${payout.period} is on its way to `
        + `${store.bankAccountName ?? 'your account'}. It can take a few working days to land, `
        + 'depending on your bank.',
        'account_update' as any,
      ).catch((e: any) => this.logger.warn(`payout notice failed: ${e?.message ?? e}`));
    }

    this.logger.log(
      `partner payout ${payout.id} sent: NGN ${amount.toFixed(2)} to ${store.storeName} (${reference})`,
    );
    return { paid: true, reference, amountNgn: amount };
  }

  // ── Admin: the bank change queue ───────────────────────────────────────

  /** Shops waiting on a bank change, oldest first. */
  async pendingBankChanges() {
    const rows = await this.ds.query(
      `SELECT id, "storeName", "storeCode",
              "bankName", "bankAccountName", "bankAccountNumber",
              "pendingBankName", "pendingBankAccountName",
              "pendingBankAccountNumber", "pendingBankRequestedAt"
         FROM "partner_stores"
        WHERE "pendingBankAccountNumber" IS NOT NULL
        ORDER BY "pendingBankRequestedAt" ASC`,
    );
    return { items: rows };
  }

  async decideBankChange(storeId: string, adminUserId: string, approve: boolean, reason?: string) {
    const store = await this.stores.findOne({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Partner store not found.');
    if (!store.pendingBankAccountNumber) {
      throw new BadRequestException('There is no bank change waiting on this shop.');
    }

    if (approve) {
      await this.stores.update(storeId, {
        bankName:          store.pendingBankName,
        bankCode:          store.pendingBankCode,
        bankAccountNumber: store.pendingBankAccountNumber,
        bankAccountName:   store.pendingBankAccountName,
        bankVerifiedAt:    new Date(),
        pendingBankName: null, pendingBankCode: null,
        pendingBankAccountNumber: null, pendingBankAccountName: null,
        pendingBankRequestedAt:   null,
      } as any);
    } else {
      await this.stores.update(storeId, {
        pendingBankName: null, pendingBankCode: null,
        pendingBankAccountNumber: null, pendingBankAccountName: null,
        pendingBankRequestedAt:   null,
      } as any);
    }

    if (store.userId) {
      this.notifications.create(
        store.userId,
        approve ? 'Your payout account was changed' : 'Your payout account was not changed',
        approve
          ? `Counter earnings will now go to ${store.pendingBankAccountName}.`
          : `We did not make that change${reason?.trim() ? `: ${reason.trim()}` : ''}. `
            + 'Your earnings still go to the account already on file.',
        'account_update' as any,
      ).catch(() => {});
    }

    return { storeId, approved: approve };
  }
}
