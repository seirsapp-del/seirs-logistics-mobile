import { Module, Global, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { KycDocument } from './kyc-document.entity';
import { KycDocumentsService } from './kyc-documents.service';
import { AuditLogEntry } from '../admin/audit-log.entity';

/**
 * The shared KYC document store.
 *
 * Global because four modules need the same review flow and none of them
 * should own it: drivers had it, partner stores are getting it, business
 * and customer are next. A second copy of this logic is the thing being
 * removed, not something to leave a door open for.
 */
@Global()
@Module({
  imports:   [TypeOrmModule.forFeature([KycDocument, AuditLogEntry])],
  providers: [KycDocumentsService],
  exports:   [KycDocumentsService, TypeOrmModule],
})
export class KycModule implements OnModuleInit {
  private readonly logger = new Logger(KycModule.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async onModuleInit() {
    /**
     * synchronize is off in production, so a new entity gets no table on
     * deploy. Created here with the same self-heal pattern the rest of the
     * codebase uses rather than a migration file nobody runs.
     *
     * No foreign key on (ownerType, ownerId): it is polymorphic and cannot
     * have one. reviewed_by_id keeps its own, since that is always a user.
     */
    try {
      await this.ds.query(`
        CREATE TABLE IF NOT EXISTS "kyc_documents" (
          "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "ownerType"       varchar(20) NOT NULL,
          "ownerId"         uuid NOT NULL,
          "ownerUserId"     uuid NULL,
          "docId"           varchar NOT NULL,
          "url"             varchar NOT NULL,
          "status"          varchar(20) NOT NULL DEFAULT 'submitted',
          "rejectionReason" text NULL,
          "reviewed_by_id"  uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
          "reviewedAt"      timestamptz NULL,
          "version"         integer NOT NULL DEFAULT 1,
          "expiresAt"       date NULL,
          "expiryWarnedAt"  timestamptz NULL,
          "createdAt"       timestamptz NOT NULL DEFAULT now(),
          "updatedAt"       timestamptz NOT NULL DEFAULT now()
        )
      `);
      await this.ds.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "kyc_documents_owner_doc"
           ON "kyc_documents" ("ownerType", "ownerId", "docId")`,
      );
      await this.ds.query(
        `CREATE INDEX IF NOT EXISTS "kyc_documents_status_created"
           ON "kyc_documents" ("status", "createdAt")`,
      );
      // The index the erase-on-account-deletion path runs on, and the one
      // the expiry sweep joins users through.
      await this.ds.query(
        `CREATE INDEX IF NOT EXISTS "kyc_documents_owner_user"
           ON "kyc_documents" ("ownerUserId")`,
      );
    } catch (e: any) {
      this.logger.error(`kyc_documents table ensure failed: ${e?.message ?? e}`);
    }

    /**
     * Copy driver_documents in, once.
     *
     * Insert-only and keyed on the unique (ownerType, ownerId, docId)
     * index, so re-running it on every boot cannot disturb a row somebody
     * has since reviewed or dated. Every column carries across unchanged,
     * including the review trail and the expiry, because losing who
     * approved what would be worse than not migrating at all.
     *
     * ownerUserId is resolved from the driver here, which is the one piece
     * of information the old table never held and the new one depends on.
     *
     * The old table is deliberately NOT dropped. If anything about this is
     * wrong it is recoverable, and a table nobody reads costs nothing.
     */
    try {
      const r = await this.ds.query(`
        INSERT INTO "kyc_documents" (
          "ownerType", "ownerId", "ownerUserId", "docId", "url", "status",
          "rejectionReason", "reviewed_by_id", "reviewedAt", "version",
          "expiresAt", "expiryWarnedAt", "createdAt", "updatedAt"
        )
        SELECT 'driver', dd."driver_id", d."userId", dd."docId", dd."url", dd."status",
               dd."rejectionReason", dd."reviewed_by_id", dd."reviewedAt", dd."version",
               dd."expiresAt", dd."expiryWarnedAt", dd."createdAt", dd."updatedAt"
          FROM "driver_documents" dd
          JOIN "drivers" d ON d.id = dd."driver_id"
        ON CONFLICT ("ownerType", "ownerId", "docId") DO NOTHING
      `);
      const n = Array.isArray(r) ? r.length : (r?.rowCount ?? 0);
      if (n) this.logger.log(`driver documents copied into the shared store: ${n}`);
    } catch (e: any) {
      this.logger.error(`driver document copy-in failed: ${e?.message ?? e}`);
    }

    /**
     * Backfill the vehicle documents of riders approved BEFORE the sync
     * existed. Moved here from drivers.module on 2026-09-02 with the table
     * it writes into.
     *
     * Approving a vehicle change used to write the insurance certificate
     * and ownership papers only to the driver record, which holds a URL and
     * nothing else, so those documents could never carry an expiry: the
     * founder could date a licence and had nowhere to click for insurance.
     *
     * Insert-only and keyed on the unique index, so it cannot disturb a
     * document somebody has already reviewed or dated. Approved because the
     * URL is on the driver record, which means an admin approved it once.
     */
    try {
      const r = await this.ds.query(`
        INSERT INTO "kyc_documents" ("ownerType", "ownerId", "ownerUserId", "docId", "url", "status", "reviewedAt")
        SELECT 'driver', d.id, d."userId", v.doc_id, v.url, 'approved', now()
          FROM "drivers" d
          CROSS JOIN LATERAL (VALUES
            ('insurance_cert',  d."insuranceCertUrl"),
            ('ownership_proof', d."ownershipProofUrl"),
            ('vehicle_photo',   d."vehiclePhotoUrl")
          ) AS v(doc_id, url)
         WHERE v.url IS NOT NULL AND v.url <> ''
        ON CONFLICT ("ownerType", "ownerId", "docId") DO NOTHING
      `);
      const n = Array.isArray(r) ? r.length : (r?.rowCount ?? 0);
      if (n) this.logger.log(`vehicle documents backfilled into the shared store: ${n}`);
    } catch (e: any) {
      this.logger.error(`vehicle document backfill failed: ${e?.message ?? e}`);
    }

    /**
     * Backfill the partner stores that already uploaded.
     *
     * Their three documents live as URL columns on partner_stores with one
     * status and one review note across all of them, so there is no
     * per-document decision to preserve: the store's own status is the
     * only signal that exists. Approved where the store is approved, which
     * is true by construction because a human approved the application
     * having looked at them, and 'active' is the legacy spelling of
     * approved on older rows.
     *
     * Anything else lands as 'submitted', which puts it in the queue,
     * which is where an unreviewed document belongs.
     *
     * No expiry is invented. Nobody recorded when these certificates run
     * out, and a made-up date is worse than an empty one: it would either
     * warn about nothing or stay silent about something real.
     */
    try {
      const r = await this.ds.query(`
        INSERT INTO "kyc_documents" ("ownerType", "ownerId", "ownerUserId", "docId", "url", "status", "reviewedAt")
        SELECT 'partner_store', ps.id, ps."userId", v.doc_id, v.url,
               CASE WHEN ps.status IN ('approved', 'active') THEN 'approved' ELSE 'submitted' END,
               CASE WHEN ps.status IN ('approved', 'active') THEN ps."reviewedAt" ELSE NULL END
          FROM "partner_stores" ps
          CROSS JOIN LATERAL (VALUES
            ('storefront_photo', ps."storefrontPhotoUrl"),
            ('cac_registration', ps."cacRegUrl"),
            ('owner_id',         ps."ownerIdUrl")
          ) AS v(doc_id, url)
         WHERE v.url IS NOT NULL AND v.url <> ''
        ON CONFLICT ("ownerType", "ownerId", "docId") DO NOTHING
      `);
      const n = Array.isArray(r) ? r.length : (r?.rowCount ?? 0);
      if (n) this.logger.log(`partner store documents backfilled: ${n}`);
    } catch (e: any) {
      this.logger.error(`partner document backfill failed: ${e?.message ?? e}`);
    }
  }
}
