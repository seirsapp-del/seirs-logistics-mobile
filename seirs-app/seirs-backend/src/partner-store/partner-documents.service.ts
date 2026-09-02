import {
  Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PartnerStore } from '../business/partner-store.entity';
import { KycDocument } from '../kyc/kyc-document.entity';
import { KycDocumentsService } from '../kyc/kyc-documents.service';
import { PARTNER_DOC_IDS, docLabel } from '../kyc/kyc-labels';

/**
 * A partner store's KYC documents, reviewed one at a time.
 *
 * Until 2026-09-02 a store's three documents were URL columns on
 * partner_stores behind ONE status and ONE review note. A blurry CAC
 * certificate therefore refused the whole application, in a single
 * sentence, and the only way back in was to apply again from the
 * beginning. Neither the certificate nor the owner's ID had anywhere to
 * record the date it runs out, though both do.
 *
 * The review flow itself lives in KycDocumentsService and is the same one
 * riders go through. Only the store-shaped parts are here: resolving which
 * store a user runs, keeping the legacy URL columns in step, and listing
 * documents with the shop's name attached.
 */
@Injectable()
export class PartnerDocumentsService {
  private readonly logger = new Logger(PartnerDocumentsService.name);

  /** Which legacy column each document id still mirrors into. */
  private static readonly LEGACY_COLUMN: Record<string, string> = {
    storefront_photo: 'storefrontPhotoUrl',
    cac_registration: 'cacRegUrl',
    owner_id:         'ownerIdUrl',
  };

  constructor(
    @InjectRepository(PartnerStore) private readonly stores: Repository<PartnerStore>,
    @InjectRepository(KycDocument)  private readonly docs:   Repository<KycDocument>,
    @InjectDataSource()             private readonly ds:     DataSource,
    private readonly kyc: KycDocumentsService,
  ) {}

  private async storeForUser(userId: string): Promise<PartnerStore> {
    const [row] = await this.ds.query(
      `SELECT "partnerStoreId" FROM users WHERE id = $1 LIMIT 1`, [userId],
    );
    const id = row?.partnerStoreId;
    if (!id) throw new ForbiddenException('You do not run a partner store.');
    const store = await this.stores.findOne({ where: { id } });
    if (!store) throw new NotFoundException('Partner store not found.');
    return store;
  }

  // ── The partner's own view ─────────────────────────────────────────────

  /**
   * Every document, including the ones never uploaded.
   *
   * Missing slots are returned as well as present ones, so the app can
   * show "CAC registration: not uploaded" rather than silently omitting
   * the row and leaving somebody to work out what is still wanted.
   */
  async myDocuments(userId: string) {
    const store = await this.storeForUser(userId);
    const rows  = await this.kyc.listFor('partner_store', store.id);
    const byId  = new Map(rows.map(r => [r.docId, r]));

    return {
      storeId:     store.id,
      storeName:   store.storeName,
      storeStatus: store.status,
      documents: PARTNER_DOC_IDS.map(docId => byId.get(docId) ?? {
        id:              null,
        docId,
        label:           docLabel('partner_store', docId),
        url:             null,
        status:          'missing' as const,
        rejectionReason: null,
        reviewedAt:      null,
        reviewedById:    null,
        expiresAt:       null,
        canExpire:       docId !== 'storefront_photo',
        version:         0,
        updatedAt:       null,
      }),
    };
  }

  /**
   * Replace ONE document, without touching the application.
   *
   * This is the whole point of the change. A partner whose CAC photo was
   * unreadable can now send that one file again; before today the only
   * route was to resubmit the entire application, which also reset the
   * store to pending_review and threw away the decisions already made on
   * the other two documents.
   *
   * The legacy URL column is written too, because the admin store page,
   * the application view and the backfill all still read it. One source of
   * truth would be better and is not today's change.
   */
  async upload(userId: string, docId: string, url: string) {
    if (!(PARTNER_DOC_IDS as readonly string[]).includes(docId)) {
      throw new BadRequestException(
        `Unknown document. Expected one of: ${PARTNER_DOC_IDS.join(', ')}.`,
      );
    }
    const clean = String(url ?? '').trim();
    if (!/^https?:\/\//i.test(clean)) {
      throw new BadRequestException('That does not look like an uploaded file.');
    }

    const store = await this.storeForUser(userId);
    const res = await this.kyc.upsert({
      ownerType:   'partner_store',
      ownerId:     store.id,
      ownerUserId: store.userId,
      docId,
      url: clean,
    });

    const column = PartnerDocumentsService.LEGACY_COLUMN[docId];
    if (column) {
      await this.ds.query(
        `UPDATE "partner_stores" SET "${column}" = $2 WHERE id = $1`, [store.id, clean],
      ).catch((e: any) => this.logger.warn(`legacy column sync failed for ${docId}: ${e?.message ?? e}`));
    }

    return { ...res, label: docLabel('partner_store', docId) };
  }

  // ── Admin ──────────────────────────────────────────────────────────────

  /**
   * The review queue, oldest waiting first.
   *
   * Oldest first deliberately, matching the driver queue: a shop sitting
   * unreviewed cannot take drop-offs, and the fair order is the order they
   * arrived.
   *
   * Store and owner columns are named one by one and joined narrowly. A
   * relation load here would pull the owner's whole User row, bank details
   * and KYC columns included, to render a shop name and an email. That
   * exact leak has been fixed three times in this repo.
   */
  async adminList(status?: string, page = 1, storeId?: string) {
    const take = 50;
    const where: any = { ownerType: 'partner_store' };
    if (status)  where.status  = status;
    if (storeId) where.ownerId = storeId;

    const [rows, total] = await this.docs.findAndCount({
      where,
      order: { createdAt: 'ASC' },
      take,
      skip: (page - 1) * take,
    });

    const ids = [...new Set(rows.map(r => r.ownerId))];
    const stores = new Map<string, any>();
    if (ids.length) {
      const found = await this.ds.query(
        `SELECT ps.id AS id, ps."storeName" AS "storeName", ps.status AS "storeStatus",
                ps."storeCode" AS "storeCode",
                u.name AS "ownerName", u.email AS "ownerEmail"
           FROM "partner_stores" ps
           LEFT JOIN "users" u ON u.id = ps."userId"
          WHERE ps.id = ANY($1)`,
        [ids],
      );
      found.forEach((s: any) => stores.set(s.id, s));
    }

    // Who signed each one off, by name. Fetched narrowly for the same
    // reason: the reviewer is a staff User.
    const reviewerIds = [...new Set(rows.map(r => r.reviewedById).filter(Boolean))] as string[];
    const reviewers = new Map<string, string>();
    if (reviewerIds.length) {
      const staff = await this.ds.query(
        `SELECT id, name FROM users WHERE id = ANY($1)`, [reviewerIds],
      );
      staff.forEach((s: any) => reviewers.set(s.id, s.name));
    }

    return {
      items: rows.map(d => ({
        id:              d.id,
        docId:           d.docId,
        label:           docLabel('partner_store', d.docId),
        url:             d.url,
        status:          d.status,
        rejectionReason: d.rejectionReason,
        version:         d.version,
        createdAt:       d.createdAt,
        reviewedAt:      d.reviewedAt,
        reviewedById:    d.reviewedById,
        reviewedByName:  d.reviewedById ? reviewers.get(d.reviewedById) ?? null : null,
        expiresAt:       d.expiresAt,
        canExpire:       d.docId !== 'storefront_photo',
        storeId:         d.ownerId,
        storeName:       stores.get(d.ownerId)?.storeName ?? null,
        storeCode:       stores.get(d.ownerId)?.storeCode ?? null,
        storeStatus:     stores.get(d.ownerId)?.storeStatus ?? null,
        ownerName:       stores.get(d.ownerId)?.ownerName ?? null,
        ownerEmail:      stores.get(d.ownerId)?.ownerEmail ?? null,
      })),
      total, page, take,
    };
  }

  counts()                 { return this.kyc.counts('partner_store'); }
  expiring(days = 30)      { return this.kyc.expiring(days, 'partner_store'); }
  listForStore(storeId: string) { return this.kyc.listFor('partner_store', storeId); }

  /**
   * Record the three documents an application arrives with.
   *
   * Called from the apply flow so a new store enters the review queue with
   * per-document rows from the start, rather than waiting for the boot
   * backfill to notice it. Re-applying goes through upsert, so each
   * document returns to 'submitted' and bumps its version exactly as a
   * single replacement does.
   */
  async recordApplication(store: PartnerStore, urls: Record<string, string | null | undefined>) {
    for (const docId of PARTNER_DOC_IDS) {
      const url = urls[docId];
      if (!url) continue;
      try {
        await this.kyc.upsert({
          ownerType:   'partner_store',
          ownerId:     store.id,
          ownerUserId: store.userId,
          docId,
          url,
        });
      } catch (e: any) {
        // One document failing must not lose an application somebody has
        // just filled in. The URL is on the store row either way.
        this.logger.warn(`application doc record failed for ${docId}: ${e?.message ?? e}`);
      }
    }
  }
}
