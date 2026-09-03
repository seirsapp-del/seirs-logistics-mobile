import {
  Injectable, Logger, NotFoundException, BadRequestException, Optional,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, SelectQueryBuilder } from 'typeorm';
import { KycDocument, KycDocStatus, KycOwnerType } from './kyc-document.entity';
import { AuditLogEntry } from '../admin/audit-log.entity';
import { docLabel, docCanExpire } from './kyc-labels';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * One review flow for every kind of KYC document.
 *
 * Generalised out of DriversService on 2026-09-02. The driver half was
 * rebuilt over 1 and 2 September and works; the partner half did not exist,
 * and building a second one would have produced two review flows that drift
 * apart at the first change.
 *
 * Everything an owner reads about a decision comes from here, so approve,
 * reject, needs_replacing and expiry warnings cannot say different things
 * to a rider and a shop.
 */
@Injectable()
export class KycDocumentsService {
  private readonly logger = new Logger(KycDocumentsService.name);

  constructor(
    @InjectRepository(KycDocument) private readonly docs: Repository<KycDocument>,
    @InjectRepository(AuditLogEntry) private readonly audit: Repository<AuditLogEntry>,
    @InjectDataSource() private readonly ds: DataSource,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /**
   * A decision, recorded so it outlives the person.
   *
   * Founder, 2026-09-02: on hard delete the document rows and the stored
   * files go, the photograph and the certificate with them, and what
   * survives is one audit line per decision. audit_logs.target is a plain
   * string with no foreign key, so it already outlives the account by
   * design.
   *
   * That policy only keeps anything if the lines exist, and until today
   * they did not: reviewDriverDocument wrote nothing to audit_logs at all.
   * So every approve, reject, needs_replacing and expiry change writes one
   * here, carrying the document, the decision, the date and the reviewer.
   *
   * Never allowed to throw. A logging failure must not roll back a
   * decision a human has already made and an owner has already been told
   * about.
   */
  private async record(
    adminUserId: string,
    action: string,
    doc: Pick<KycDocument, 'ownerType' | 'ownerId' | 'ownerUserId' | 'docId'>,
    meta: Record<string, any>,
  ) {
    try {
      const [admin] = await this.ds.query(
        `SELECT name FROM users WHERE id = $1 LIMIT 1`, [adminUserId],
      ).catch(() => [{ name: null }]);

      await this.audit.save(this.audit.create({
        adminId:   adminUserId,
        adminName: admin?.name ?? 'Admin',
        action,
        // Keyed on the PERSON, not the document, because the document row
        // is the thing that gets erased. user:<id> is the existing
        // convention and is what a later question is asked in terms of.
        target:    doc.ownerUserId ? `user:${doc.ownerUserId}` : `${doc.ownerType}:${doc.ownerId}`,
        meta:      { ownerType: doc.ownerType, ownerId: doc.ownerId, docId: doc.docId, ...meta },
      }));
    } catch (e: any) {
      this.logger.warn(`kyc audit write failed (${action}): ${e?.message ?? e}`);
    }
  }

  /** Unawaited notice: a push failure must not undo an admin's decision. */
  private notify(userId: string | null, title: string, body: string) {
    if (!userId || !this.notifications) return;
    // ACCOUNT_UPDATE rather than GENERAL: this is somebody's standing being
    // changed by an admin, and that class is not suppressible by
    // notification preferences.
    this.notifications.create(userId, title, body, 'account_update' as any)
      .catch((e: any) => this.logger.warn(`kyc notice failed: ${e?.message ?? e}`));
  }

  // ── Upload ─────────────────────────────────────────────────────────────

  /**
   * Record an upload, or a replacement of one.
   *
   * A new file always returns to 'submitted' and bumps the version:
   * approval attaches to a specific file, not to the slot it occupies, so
   * an approved partner cannot swap in a different certificate and inherit
   * the old decision.
   *
   * The new url also CLEARS the expiry and the warn-once stamp. Last
   * year's date does not describe this year's certificate, and leaving it
   * would leave a fresh document carrying a lapsed date and a warning
   * already spent. The driver path did not do this before today.
   */
  async upsert(params: {
    ownerType:   KycOwnerType;
    ownerId:     string;
    ownerUserId: string | null;
    docId:       string;
    url:         string;
    /**
     * Where the photograph was taken, when the device could say.
     *
     * Always overwritten alongside the url, including with nulls: a new
     * file taken with location refused must not inherit the coordinates
     * of the one it replaced, or the second upload silently borrows the
     * first one's alibi.
     */
    capturedLat?:       number | null;
    capturedLng?:       number | null;
    capturedAccuracyM?: number | null;
  }) {
    const { ownerType, ownerId, ownerUserId, docId, url } = params;
    const capture = {
      capturedLat:       params.capturedLat       ?? null,
      capturedLng:       params.capturedLng       ?? null,
      capturedAccuracyM: params.capturedAccuracyM ?? null,
    };
    const existing = await this.docs.findOne({ where: { ownerType, ownerId, docId } });

    if (existing) {
      await this.docs.update(existing.id, {
        url,
        ownerUserId,
        status:          'submitted',
        rejectionReason: null,
        reviewedById:    null,
        reviewedAt:      null,
        version:         existing.version + 1,
        expiresAt:       null,
        expiryWarnedAt:  null,
        ...capture,
      } as any);
      return { docId, saved: true, status: 'submitted' as const, version: existing.version + 1 };
    }

    await this.docs.save(this.docs.create({ ownerType, ownerId, ownerUserId, docId, url, ...capture } as any));
    return { docId, saved: true, status: 'submitted' as const, version: 1 };
  }

  /** Everything this owner has uploaded, with its real review state. */
  async listFor(ownerType: KycOwnerType, ownerId: string) {
    const rows = await this.docs.find({
      where: { ownerType, ownerId },
      order: { updatedAt: 'DESC' },
    });
    return rows.map(d => ({
      id:              d.id,
      docId:           d.docId,
      label:           docLabel(ownerType, d.docId),
      url:             d.url,
      status:          d.status,
      rejectionReason: d.rejectionReason,
      reviewedAt:      d.reviewedAt,
      reviewedById:    d.reviewedById,
      expiresAt:       d.expiresAt,
      canExpire:       docCanExpire(d.docId),
      version:         d.version,
      updatedAt:       d.updatedAt,
      capturedLat:       d.capturedLat != null ? Number(d.capturedLat) : null,
      capturedLng:       d.capturedLng != null ? Number(d.capturedLng) : null,
      capturedAccuracyM: d.capturedAccuracyM,
    }));
  }

  // ── Review ─────────────────────────────────────────────────────────────

  /**
   * Approve, reject, or mark a document as needing replacement.
   *
   * A rejection reason is REQUIRED. Without one they upload the same photo
   * again, which wastes their time and the reviewer's, and it was already
   * being written for nobody to read before the notices existed.
   */
  async review(
    id: string,
    adminUserId: string,
    decision: KycDocStatus & ('approved' | 'rejected' | 'needs_replacing'),
    reason?: string,
    expiresAt?: string | null,
  ) {
    const doc = await this.docs.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found.');

    if (decision === 'rejected' && !reason?.trim()) {
      throw new BadRequestException('Tell them why, or they will upload the same photo again.');
    }
    if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
      throw new BadRequestException('Expiry must be a date, as YYYY-MM-DD.');
    }
    // A storefront photo has no validity to run out, so a date on one is a
    // reviewer mistake rather than a fact about the document.
    if (expiresAt && !docCanExpire(doc.docId)) {
      throw new BadRequestException(`${docLabel(doc.ownerType, doc.docId)} does not expire, so it takes no date.`);
    }

    await this.docs.update(id, {
      status:          decision,
      // needs_replacing carries a reason too, but as an instruction rather
      // than a fault: "your CAC ran out on the 1st" is not a complaint.
      rejectionReason: decision === 'approved' ? null : (reason?.trim() || null),
      reviewedById:    adminUserId,
      reviewedAt:      new Date(),
      // Only an approval carries an expiry: a refused document has no
      // validity to run out. Blank clears any date already there.
      ...(decision === 'approved' ? { expiresAt: expiresAt || null } : {}),
      // A new decision restarts the expiry warning clock.
      expiryWarnedAt: null,
    } as any);

    const label = docLabel(doc.ownerType, doc.docId);
    const where = doc.ownerType === 'driver'
      ? 'Open KYC Verification'
      : 'Open your documents';

    this.notify(
      doc.ownerUserId,
      decision === 'approved'           ? `${label} approved`
        : decision === 'needs_replacing' ? `${label} needs replacing`
        : `${label} needs redoing`,
      decision === 'approved'
        ? `${label} has been checked and accepted. Nothing else is needed for it.`
        : decision === 'needs_replacing'
          ? `${label} is no longer current${reason?.trim() ? `: ${reason.trim()}` : ''}. `
            + 'Nothing is wrong with what you sent, it has simply run out. '
            + `${where} and upload the current one.`
          : `${label} was not accepted. ${reason!.trim()} ${where} to upload it again.`,
    );

    await this.record(adminUserId, `kyc_doc_${decision}`, doc, {
      decision,
      reason:    reason?.trim() || null,
      expiresAt: decision === 'approved' ? (expiresAt || null) : null,
      version:   doc.version,
      url:       doc.url,
    });

    /**
     * Approving an identity document marks the person ID-verified.
     *
     * WHY. There were two identity systems and they did not speak to each
     * other. A National ID approved HERE left users.identityVerifiedAt null,
     * because only the Customer ID Queue (identity_verifications) ever set
     * it. The same document, submitted twice, reviewed in two places.
     *
     * Not cosmetic: drivers.service.ts lowers a rider's value level when
     * identityVerifiedAt is null, and deliveries.service.ts reads it too. So
     * a rider whose ID had been checked and approved was still scored as
     * unverified. The founder found it from the other side: the badge was
     * green on a seeded account and would have been grey on every real one.
     *
     * Only ever SET, never cleared. Rejecting a photo is about the photo;
     * withdrawing a verification is a deliberate act with its own route and
     * its own audit line. COALESCE keeps the original verification date if
     * one already exists, because that is when they were first verified.
     */
    const ID_DOC_TYPE: Record<string, string> = {
      national_id_front: 'nin',
      national_id_back:  'nin',
      drivers_license:   'drivers_licence',
    };
    if (decision === 'approved' && ID_DOC_TYPE[doc.docId] && doc.ownerUserId) {
      try {
        await this.docs.manager.query(
          `UPDATE "users"
              SET "identityVerifiedAt" = COALESCE("identityVerifiedAt", now()),
                  "identityDocType"    = COALESCE("identityDocType", $2)
            WHERE id = $1`,
          [doc.ownerUserId, ID_DOC_TYPE[doc.docId]],
        );
      } catch {
        // Never fail an approval an admin has already made over this.
      }
    }

    return { id, status: decision };
  }

  /**
   * Set or change an expiry on a document already decided.
   *
   * Separate from review on purpose: going through approve would fire a
   * fresh "approved" notice at somebody for a decision made days ago.
   * Null clears it.
   */
  async setExpiry(id: string, adminUserId: string, expiresAt: string | null) {
    const doc = await this.docs.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found.');
    if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
      throw new BadRequestException('Expiry must be a date, as YYYY-MM-DD.');
    }
    if (expiresAt && !docCanExpire(doc.docId)) {
      throw new BadRequestException(`${docLabel(doc.ownerType, doc.docId)} does not expire, so it takes no date.`);
    }

    await this.docs.update(id, {
      expiresAt:      expiresAt || null,
      reviewedById:   adminUserId,
      reviewedAt:     new Date(),
      // A new date re-arms the 30-day warning, so a corrected expiry warns
      // again rather than staying silent because the old one already had.
      expiryWarnedAt: null,
    } as any);

    await this.record(adminUserId, 'kyc_doc_expiry_set', doc, {
      expiresAt: expiresAt || null,
      previous:  doc.expiresAt,
    });

    return { id, expiresAt: expiresAt || null };
  }

  // ── Expiry ─────────────────────────────────────────────────────────────

  /**
   * The documents lapsing or already lapsed, as a LIST.
   *
   * Counts are not work: the founder's objection is exact, "if we have
   * 1000 drivers we will have to manually check all their id again to know
   * which is expired". This is the list you act on, worst first.
   *
   * One join to users for every owner type, which is what ownerUserId
   * buys. ownerType narrows it when a screen only wants its own kind.
   */
  async expiring(days = 30, ownerType?: KycOwnerType) {
    const soon = new Date();
    soon.setDate(soon.getDate() + days);

    const qb = this.docs
      .createQueryBuilder('d')
      // Columns named one by one. A leftJoinAndSelect on the user relation
      // here would carry bank details and KYC scan URLs into a response
      // that renders a name and an email.
      .leftJoin('users', 'u', 'u.id = d."ownerUserId"')
      .select([
        'd.id AS id', 'd."docId" AS "docId"', 'd."expiresAt" AS "expiresAt"',
        'd.url AS url', 'd."expiryWarnedAt" AS "expiryWarnedAt"',
        'd."ownerType" AS "ownerType"', 'd."ownerId" AS "ownerId"',
        'u.id AS "userId"', 'u.name AS "ownerName"', 'u.email AS "ownerEmail"',
        'u.phone AS "ownerPhone"', 'u."accountId" AS "accountId"',
      ])
      .where('d.status = :s', { s: 'approved' })
      .andWhere('d."expiresAt" IS NOT NULL')
      .andWhere('d."expiresAt" <= :soon', { soon: soon.toISOString().slice(0, 10) })
      .orderBy('d."expiresAt"', 'ASC')
      .limit(500);

    if (ownerType) qb.andWhere('d."ownerType" = :t', { t: ownerType });

    const rows = await qb.getRawMany();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    return {
      items: rows.map((r: any) => {
        const daysLeft = Math.ceil((new Date(r.expiresAt).getTime() - today.getTime()) / 86_400_000);
        return {
          ...r,
          label:    docLabel(r.ownerType, r.docId),
          daysLeft,
          expired:  daysLeft < 0,
          warned:   !!r.expiryWarnedAt,
        };
      }),
    };
  }

  async counts(ownerType?: KycOwnerType) {
    const today   = new Date().toISOString().slice(0, 10);
    const soonDt  = new Date(); soonDt.setDate(soonDt.getDate() + 30);
    const soonStr = soonDt.toISOString().slice(0, 10);
    // Typed rather than `any`, so getRawOne keeps its type argument.
    const scope = (qb: SelectQueryBuilder<KycDocument>) =>
      (ownerType ? qb.andWhere('d."ownerType" = :t', { t: ownerType }) : qb);

    const [waiting, expired, expiringSoon, ownersWaiting] = await Promise.all([
      scope(this.docs.createQueryBuilder('d').where('d.status = :s', { s: 'submitted' })).getCount(),
      scope(this.docs.createQueryBuilder('d')
        .where('d.status = :s', { s: 'approved' })
        .andWhere('d."expiresAt" IS NOT NULL AND d."expiresAt" < :today', { today })).getCount(),
      scope(this.docs.createQueryBuilder('d')
        .where('d.status = :s', { s: 'approved' })
        .andWhere('d."expiresAt" IS NOT NULL')
        .andWhere('d."expiresAt" >= :today AND d."expiresAt" <= :soon', { today, soon: soonStr })).getCount(),
      scope(this.docs.createQueryBuilder('d')
        .select('COUNT(DISTINCT d."ownerId")', 'c')
        .where('d.status = :s', { s: 'submitted' })).getRawOne<{ c: string }>(),
    ]);

    return { waiting, expired, expiringSoon, ownersWaiting: Number(ownersWaiting?.c ?? 0) };
  }

  /**
   * Warn everybody whose document lapses within 30 days, once each.
   *
   * No lower bound on the window, deliberately. The first driver version
   * used `expiresAt >= today`, which EXCLUDED anything already lapsed, so
   * somebody whose certificate expired yesterday was told less than
   * somebody whose expires next month. Backwards: the lapsed one is the
   * urgent case. The message says which it is.
   */
  async warnExpiring() {
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    const soonStr = soon.toISOString().slice(0, 10);

    let due: any[] = [];
    try {
      due = await this.docs
        .createQueryBuilder('d')
        .select([
          'd.id AS id', 'd."docId" AS "docId"', 'd."expiresAt" AS "expiresAt"',
          'd."ownerType" AS "ownerType"', 'd."ownerUserId" AS "userId"',
        ])
        .where('d.status = :s', { s: 'approved' })
        .andWhere('d."expiresAt" IS NOT NULL')
        .andWhere('d."expiresAt" <= :soon', { soon: soonStr })
        .andWhere('d."expiryWarnedAt" IS NULL')
        .getRawMany();
    } catch (e: any) {
      // The table is self-healed on boot; if that has not run yet, say so
      // once rather than throwing inside a scheduled job.
      this.logger.warn(`expiry warning skipped: ${e?.message ?? e}`);
      return { warned: 0 };
    }

    let warned = 0;
    for (const row of due) {
      const days  = Math.ceil((new Date(row.expiresAt).getTime() - Date.now()) / 86_400_000);
      const label = docLabel(row.ownerType, row.docId);
      const where = row.ownerType === 'driver' ? 'Open KYC Verification in the app' : 'Open your documents in the app';
      if (row.userId && this.notifications) {
        try {
          await this.notifications.create(
            row.userId,
            days < 0
              ? `${label} has expired`
              : `${label} expires in ${days} day${days === 1 ? '' : 's'}`,
            `${label} is valid until ${row.expiresAt}. ${where}, tap it, and upload the new one. `
            + 'Nothing stops on that date, but our team will be told it has lapsed.',
            'account_update' as any,
          );
          warned++;
        } catch { /* one owner failing must not stop the rest */ }
      }
      await this.docs.update(row.id, { expiryWarnedAt: new Date() } as any).catch(() => {});
    }
    if (warned) this.logger.log(`kyc expiry warnings sent: ${warned}`);
    return { warned };
  }

  /**
   * Erase the documents belonging to a deleted account.
   *
   * The polymorphic key has no foreign key, so the ON DELETE CASCADE that
   * driver_documents relied on is gone. This replaces it, and the founder's
   * decision is what it implements: the rows and the files go, the audit
   * lines stay. Called from the hard-delete path, keyed on the user rather
   * than on any one owner type, so it covers all four.
   */
  async eraseForUser(userId: string): Promise<{ deleted: number }> {
    const res = await this.docs.delete({ ownerUserId: userId } as any);
    return { deleted: res.affected ?? 0 };
  }
}
