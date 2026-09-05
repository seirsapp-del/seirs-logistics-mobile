/**
 * One queue, one row per rider.
 *
 * WHY this exists, in the founder's words on 2 September 2026: "what you did
 * is create an entire section for something that could have been wired into
 * the drivers kyc queue, and when I told you, your best idea was to stack it
 * in the same page by putting it on top of each other."
 *
 * He was right. There were three separate things a reviewer had to notice
 * about the same rider, in three places:
 *
 *   an account waiting to be approved      the driver roster, status pending
 *   documents waiting to be read           kyc_documents, status submitted
 *   a vehicle waiting to be approved       driver_vehicle_changes, pending
 *
 * A rider can be in all three at once and appeared as three unrelated
 * entries, or, worse, in none of them visibly: an APPROVED rider who uploads
 * a new licence is not pending and has no vehicle change, so the only queue
 * that showed them was the one nobody had wired a badge to.
 *
 * This returns the rider once, with everything they are waiting on. Sorted
 * oldest first, because the person who has waited longest is the one being
 * failed hardest, and a rider in a queue cannot earn.
 *
 * Columns are named rather than joined as entities. A KYC queue must not
 * become another way to read somebody's payout bank account.
 */
import { DataSource } from 'typeorm';
import { rangeStart, rangeEnd } from '../common/utils/date-range';

export type KycNeed = 'account_approval' | 'documents' | 'vehicle_change';

export interface KycQueueRow {
  driverId:       string;
  userId:         string;
  name:           string | null;
  email:          string | null;
  phone:          string | null;
  accountId:      string | null;
  accountStatus:  string;
  vehicleType:    string | null;
  vehiclePlate:   string | null;
  /** Days since the OLDEST thing this rider is waiting on. */
  waitingDays:    number;
  waitingSince:   string;
  docsSubmitted:  number;
  docsRejected:   number;
  vehicleChange:  {
    id: string;
    requestedVehicle: string;
    currentVehicle:   string | null;
    vehiclePlate:     string | null;
    make: string | null; model: string | null; year: string | null; color: string | null;
    ownership: string | null; ownerName: string | null; ownerPhone: string | null;
    photoExteriorUrl:  string | null;
    photoInteriorUrl:  string | null;
    photoPlateUrl:     string | null;
    ownershipProofUrl: string | null;
    insuranceCertUrl:  string | null;
    ticketId:          string | null;
    createdAt:         string;
  } | null;
  needs: KycNeed[];
}

const DAY_MS = 86_400_000;

/**
 * When this rider started waiting, in SQL.
 *
 * MUST stay identical to the `candidates` / Math.min block below, which
 * derives the same value in JS for display and for the oldest-first sort.
 * A range on any ONE of these three timestamps would hide rows whose wait
 * is defined by a different one, and it would do it invisibly: the row
 * simply would not appear, with nothing to say why.
 *
 * LEAST ignores NULLs in Postgres, which is exactly what .filter(Boolean)
 * then Math.min does in the JS. The driver's own createdAt only counts
 * while the account is still pending, matching the ternary below.
 *
 * If the two ever drift, the queue will sort by one rule and filter by
 * another, which is the failure this file is one line away from at all
 * times. Change both or neither.
 */
const WAITING_SINCE_SQL = `LEAST(
  CASE WHEN d.status = 'pending' THEN d."createdAt" END,
  dc.oldest_submitted,
  pc."createdAt"
)`;

export async function buildKycQueue(
  ds: DataSource,
  /**
   * Waiting since between, as YYYY-MM-DD.
   *
   * No default window here, unlike every other board. This queue is
   * unpaginated by intent, so there is nothing to slide, and on a review
   * queue an item nobody has looked at in six weeks is exactly the item
   * that must not fall off the bottom.
   */
  opts: { from?: string; to?: string } = {},
): Promise<{ count: number; items: KycQueueRow[] }> {
  const waitFrom = rangeStart(opts.from);
  const waitTo   = rangeEnd(opts.to);
  /**
   * Every rider who is waiting on ANY of the three, in one pass.
   *
   * A LEFT JOIN onto aggregates rather than three round trips, so a rider
   * with an account decision AND documents AND a vehicle change is one row
   * rather than three that a screen then has to reconcile.
   */
  const rows = await ds.query(`
    WITH doc_counts AS (
      /* kyc_documents since 2026-09-02, scoped to riders. The table is
         shared with partner stores, businesses and customers, so this
         queue must say whose documents it is counting or a shop's CAC
         certificate would appear against a rider's row. */
      SELECT "ownerId" AS driver_id,
             COUNT(*) FILTER (WHERE status = 'submitted') AS submitted,
             COUNT(*) FILTER (WHERE status = 'rejected')  AS rejected,
             MIN("createdAt") FILTER (WHERE status = 'submitted') AS oldest_submitted
        FROM kyc_documents
       WHERE "ownerType" = 'driver'
       GROUP BY "ownerId"
    ),
    pending_change AS (
      SELECT DISTINCT ON ("driverId") *
        FROM driver_vehicle_changes
       WHERE status = 'pending'
       ORDER BY "driverId", "createdAt" ASC
    )
    SELECT
      d.id                     AS "driverId",
      d."userId"               AS "userId",
      d.status                 AS "accountStatus",
      d."vehicleType"          AS "vehicleType",
      d."vehiclePlate"         AS "vehiclePlate",
      d."createdAt"            AS "driverCreatedAt",
      u.name                   AS "name",
      u.email                  AS "email",
      u.phone                  AS "phone",
      u."accountId"            AS "accountId",
      COALESCE(dc.submitted, 0) AS "docsSubmitted",
      COALESCE(dc.rejected, 0)  AS "docsRejected",
      dc.oldest_submitted       AS "oldestSubmitted",
      pc.id                    AS "vcId",
      pc."vehicleType"         AS "vcVehicleType",
      pc."vehiclePlate"        AS "vcPlate",
      pc.make                  AS "vcMake",
      pc.model                 AS "vcModel",
      pc.year                  AS "vcYear",
      pc.color                 AS "vcColor",
      pc.ownership             AS "vcOwnership",
      pc."ownerName"           AS "vcOwnerName",
      pc."ownerPhone"          AS "vcOwnerPhone",
      pc."photoExteriorUrl"    AS "vcExterior",
      pc."photoInteriorUrl"    AS "vcInterior",
      pc."photoPlateUrl"       AS "vcPlate2",
      pc."ownershipProofUrl"   AS "vcOwnership2",
      pc."insuranceCertUrl"    AS "vcInsurance",
      pc."ticketId"            AS "vcTicketId",
      pc."createdAt"           AS "vcCreatedAt"
    FROM drivers d
    JOIN users u              ON u.id = d."userId"
    LEFT JOIN doc_counts dc   ON dc.driver_id = d.id
    LEFT JOIN pending_change pc ON pc."driverId" = d.id
    WHERE (d.status = 'pending'
       OR COALESCE(dc.submitted, 0) > 0
       OR pc.id IS NOT NULL)
      ${waitFrom ? `AND ${WAITING_SINCE_SQL} >= $${waitTo ? 1 : 1}` : ''}
      ${waitTo   ? `AND ${WAITING_SINCE_SQL} <  $${waitFrom ? 2 : 1}` : ''}
  `, [
    ...(waitFrom ? [waitFrom] : []),
    ...(waitTo   ? [waitTo]   : []),
  ]);

  const now = Date.now();
  const items: KycQueueRow[] = rows.map((r: any) => {
    const needs: KycNeed[] = [];
    if (r.accountStatus === 'pending')   needs.push('account_approval');
    if (Number(r.docsSubmitted) > 0)     needs.push('documents');
    if (r.vcId)                          needs.push('vehicle_change');

    /**
     * Waiting since the oldest OUTSTANDING thing, not since they signed up.
     * An approved rider who uploaded a licence an hour ago has waited an
     * hour, and showing them as waiting since March would bury the people
     * who really have.
     */
    const candidates = [
      r.accountStatus === 'pending' ? r.driverCreatedAt : null,
      r.oldestSubmitted,
      r.vcCreatedAt,
    ].filter(Boolean).map((d: any) => new Date(d).getTime());
    const since = candidates.length ? Math.min(...candidates) : now;

    return {
      driverId:      r.driverId,
      userId:        r.userId,
      name:          r.name ?? null,
      email:         r.email ?? null,
      phone:         r.phone ?? null,
      accountId:     r.accountId ?? null,
      accountStatus: r.accountStatus,
      vehicleType:   r.vehicleType ?? null,
      vehiclePlate:  r.vehiclePlate ?? null,
      waitingDays:   Math.max(0, Math.floor((now - since) / DAY_MS)),
      waitingSince:  new Date(since).toISOString(),
      docsSubmitted: Number(r.docsSubmitted ?? 0),
      docsRejected:  Number(r.docsRejected ?? 0),
      vehicleChange: r.vcId ? {
        id:               r.vcId,
        requestedVehicle: r.vcVehicleType,
        currentVehicle:   r.vehicleType ?? null,
        vehiclePlate:     r.vcPlate ?? null,
        make:  r.vcMake ?? null, model: r.vcModel ?? null,
        year:  r.vcYear ?? null, color: r.vcColor ?? null,
        ownership:  r.vcOwnership ?? null,
        ownerName:  r.vcOwnerName ?? null,
        ownerPhone: r.vcOwnerPhone ?? null,
        photoExteriorUrl:  r.vcExterior ?? null,
        photoInteriorUrl:  r.vcInterior ?? null,
        photoPlateUrl:     r.vcPlate2 ?? null,
        ownershipProofUrl: r.vcOwnership2 ?? null,
        insuranceCertUrl:  r.vcInsurance ?? null,
        ticketId:          r.vcTicketId ?? null,
        createdAt:         new Date(r.vcCreatedAt).toISOString(),
      } : null,
      needs,
    };
  })
  // Oldest wait first.
  .sort((a: KycQueueRow, b: KycQueueRow) => a.waitingSince.localeCompare(b.waitingSince));

  return { count: items.length, items };
}
