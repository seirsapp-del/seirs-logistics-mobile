import {
  Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PartnerStore } from '../business/partner-store.entity';
import { KycDocument } from '../kyc/kyc-document.entity';
import { KycDocumentsService } from '../kyc/kyc-documents.service';
import {
  PARTNER_DOC_IDS, PARTNER_DOC_SPEC, docLabel, partnerDocSpec,
} from '../kyc/kyc-labels';

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
/**
 * Above this many metres of reported uncertainty, a fix is too vague to
 * argue from. Founder's figure, 2026-09-03.
 */
export const ACCURACY_LIMIT_M = 50;

/**
 * Above this, the photograph was taken somewhere else.
 *
 * Deliberately generous. A market stall's pin can sit on the road outside
 * rather than in the stall, a phone can be a street off, and the address
 * itself came from an autocomplete that may have chosen the building
 * next door. 500m is well past all of that and well short of the 40km
 * case this exists to catch.
 */
export const FAR_FROM_STORE_M = 500;

@Injectable()
export class PartnerDocumentsService {
  private readonly logger = new Logger(PartnerDocumentsService.name);

  /** Which legacy column each document id still mirrors into. */
  private static readonly LEGACY_COLUMN: Record<string, string> = {
    storefront_photo: 'storefrontPhotoUrl',
    cac_registration: 'cacRegUrl',
    // owner_id_front since 2026-09-03, when the ID became two sides. The
    // back has no legacy column and needs none: nothing outside the
    // review store has ever read it.
    owner_id_front:   'ownerIdUrl',
  };

  /**
   * How far a photograph was taken from the address it claims, in metres.
   *
   * Great-circle rather than road distance, deliberately: the question is
   * "is this the same place", not "how long is the drive". A storefront
   * photograph 40km from the stated address is the signal; 300m is a
   * phone with a poor fix and means nothing.
   */
  // Public so the move review can measure a photo against the PROPOSED
  // pin with the same maths, rather than growing a second haversine
  // that drifts from this one.
  static metresBetween(
    aLat: number, aLng: number, bLat: number, bLng: number,
  ): number {
    const R = 6_371_000;
    const rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(bLat - aLat);
    const dLng = rad(bLng - aLng);
    const h = Math.sin(dLat / 2) ** 2
      + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
  }

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

    /**
     * Every slot, present or not, with what policy says about it.
     *
     * The app needs the group, the hint and whether it is required in
     * order to show four sections rather than one flat list, and it
     * cannot invent any of that: required-ness is a fact about the KIND
     * of document, and a slot nobody has filled has no row to carry it.
     */
    const documents = PARTNER_DOC_SPEC.map(spec => {
      const row = byId.get(spec.docId);
      const base = {
        docId:         spec.docId,
        label:         spec.label,
        group:         spec.group,
        hint:          spec.hint,
        required:      spec.required,
        needsLocation: spec.needsLocation,
        canExpire:     spec.canExpire,
      };
      if (!row) {
        return {
          ...base,
          id: null, url: null, status: 'missing' as const,
          rejectionReason: null, reviewedAt: null, reviewedById: null,
          expiresAt: null, version: 0, updatedAt: null,
        };
      }
      return { ...row, ...base };
    });

    const missingRequired = documents
      .filter(d => d.required && (d.status === 'missing' || d.status === 'rejected'))
      .map(d => d.docId);

    return {
      storeId:     store.id,
      storeName:   store.storeName,
      storeStatus: store.status,
      documents,
      /** What still stands between this shop and a decision. */
      missingRequired,
      complete: missingRequired.length === 0,
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
  async upload(
    userId: string,
    docId: string,
    url: string,
    capture?: { lat?: number; lng?: number; accuracyM?: number },
  ) {
    const spec = partnerDocSpec(docId);
    if (!spec) {
      throw new BadRequestException(
        `Unknown document. Expected one of: ${PARTNER_DOC_IDS.join(', ')}.`,
      );
    }
    const clean = String(url ?? '').trim();
    if (!/^https?:\/\//i.test(clean)) {
      throw new BadRequestException('That does not look like an uploaded file.');
    }

    /**
     * A premises photograph is asked to say where it was taken, and is
     * still accepted when it cannot.
     *
     * The permission is refusable and a fix can fail indoors under a
     * zinc roof, which describes a great many Nigerian shops. Refusing
     * the upload would punish somebody for their building. The absence
     * is recorded and shown to the reviewer instead.
     */
    const lat = Number.isFinite(capture?.lat as number) ? Number(capture!.lat) : null;
    const lng = Number.isFinite(capture?.lng as number) ? Number(capture!.lng) : null;
    const acc = Number.isFinite(capture?.accuracyM as number)
      ? Math.round(Number(capture!.accuracyM)) : null;

    const store = await this.storeForUser(userId);
    const res = await this.kyc.upsert({
      ownerType:   'partner_store',
      ownerId:     store.id,
      ownerUserId: store.userId,
      docId,
      url: clean,
      capturedLat:       spec.needsLocation ? lat : null,
      capturedLng:       spec.needsLocation ? lng : null,
      capturedAccuracyM: spec.needsLocation ? acc : null,
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

  counts()            { return this.kyc.counts('partner_store'); }
  expiring(days = 30) { return this.kyc.expiring(days, 'partner_store'); }

  /**
   * One shop's documents, with the question a reviewer actually has.
   *
   * That question is not "what are the coordinates", it is "was this
   * photographed at the shop it claims to be". So the raw pair is turned
   * into a distance from the stated address and a plain verdict, because
   * nobody should be doing great-circle arithmetic in their head at
   * eleven at night.
   *
   * Three separate things can be wrong and they are NOT the same:
   *   noLocation  the phone never said. Common indoors, means nothing.
   *   imprecise   it said, badly. A poor fix, not a lie.
   *   farFromStore it said clearly, and it was somewhere else.
   * Only the third is a fraud signal. Collapsing them into one flag
   * would put honest applicants under a cloud for having a zinc roof.
   */
  async listForStore(storeId: string) {
    const rows  = await this.kyc.listFor('partner_store', storeId);
    const store = await this.stores.findOne({ where: { id: storeId } });

    const sLat = store?.storeLat != null ? Number(store.storeLat) : null;
    const sLng = store?.storeLng != null ? Number(store.storeLng) : null;
    const haveStorePin = Number.isFinite(sLat as number) && Number.isFinite(sLng as number);

    return rows.map(d => {
      const spec = partnerDocSpec(d.docId);
      const lat  = (d as any).capturedLat;
      const lng  = (d as any).capturedLng;
      const acc  = (d as any).capturedAccuracyM as number | null;
      const located = Number.isFinite(lat) && Number.isFinite(lng);

      const metresFromStore = (located && haveStorePin)
        ? PartnerDocumentsService.metresBetween(lat, lng, sLat as number, sLng as number)
        : null;

      return {
        ...d,
        group:         spec?.group    ?? null,
        required:      spec?.required ?? false,
        needsLocation: spec?.needsLocation ?? false,
        metresFromStore,
        // Only meaningful on a document we asked to be located.
        noLocation:   (spec?.needsLocation ?? false) && !located,
        imprecise:    located && acc != null && acc > ACCURACY_LIMIT_M,
        farFromStore: metresFromStore != null && metresFromStore > FAR_FROM_STORE_M,
      };
    });
  }

  /**
   * Record the three documents an application arrives with.
   *
   * Called from the apply flow so a new store enters the review queue with
   * per-document rows from the start, rather than waiting for the boot
   * backfill to notice it. Re-applying goes through upsert, so each
   * document returns to 'submitted' and bumps its version exactly as a
   * single replacement does.
   */
  /**
   * @param captures Where each photo was TAKEN, when the phone could say.
   *
   * Only premises photographs carry one, and only when the applicant let
   * the phone read its position. The absence is normal and never blocks an
   * application: a shop under a zinc roof may never get a fix, and refusing
   * somebody their livelihood over their roof is the wrong trade.
   */
  async recordApplication(
    store: PartnerStore,
    urls: Record<string, string | null | undefined>,
    captures?: Record<string, { lat?: number; lng?: number; accuracyM?: number } | undefined>,
  ) {
    for (const docId of PARTNER_DOC_IDS) {
      const url = urls[docId];
      if (!url) continue;
      const spec = partnerDocSpec(docId);
      const cap = spec?.needsLocation ? captures?.[docId] : undefined;
      try {
        await this.kyc.upsert({
          ownerType:   'partner_store',
          ownerId:     store.id,
          ownerUserId: store.userId,
          docId,
          url,
          capturedLat:       Number.isFinite(cap?.lat as number) ? Number(cap!.lat) : null,
          capturedLng:       Number.isFinite(cap?.lng as number) ? Number(cap!.lng) : null,
          capturedAccuracyM: Number.isFinite(cap?.accuracyM as number) ? Math.round(Number(cap!.accuracyM)) : null,
        });
      } catch (e: any) {
        // One document failing must not lose an application somebody has
        // just filled in. The URL is on the store row either way.
        this.logger.warn(`application doc record failed for ${docId}: ${e?.message ?? e}`);
      }
    }
  }
}
