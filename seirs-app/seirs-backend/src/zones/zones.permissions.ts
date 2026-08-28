import type { Zone } from './zone.entity';
import { isBlockingStatus } from './zone-window';

/**
 * Two permissions, because closing an area and pricing an area are two
 * different jobs with two different blast radiuses.
 *
 * A finance officer tuning a corridor multiplier must not be able to
 * declare a curfew, and an ops manager declaring a curfew during an
 * emergency must not have to hold the keys to the rate card to do it.
 *
 * Neither slug is in the backend role catalogue yet (roles.seed.ts
 * PERMISSION_CATALOGUE), which is owned by another module. Until a slug
 * is added there no custom role can hold it, so today these resolve for
 * super admins only, by either route: the legacy adminRole enum or the
 * seeded super_admin dynamic role holding the '*' wildcard. That is the
 * safe default. The moment the slugs appear in the catalogue, ticking
 * one grants exactly the half it names, with no change here.
 */
export const ZONE_PERMISSION_CLOSE = 'zones.close';
export const ZONE_PERMISSION_PRICE = 'zones.price';

export type ZonePermission = typeof ZONE_PERMISSION_CLOSE | typeof ZONE_PERMISSION_PRICE;

/** The shape a zone write takes, before it is a row. */
export type ZoneDraft = Pick<Zone, 'status' | 'effects'>;

/**
 * Which permissions this zone's CONTENT requires.
 *
 * Driven by what the row actually does, not by which field the request
 * happened to touch. A row that refuses work needs zones.close whether
 * the refusal arrived as a status or as a vehicle ban; a row that moves
 * money needs zones.price whether it moves it by multiplier, by
 * surcharge or by rewriting the pump price the rider is paid at.
 */
export function permissionsRequiredBy(zone: ZoneDraft | null | undefined): ZonePermission[] {
  if (!zone) return [];
  const needed: ZonePermission[] = [];
  const fx = zone.effects || {};

  const bansSomething = Array.isArray(fx.vehicleBans) && fx.vehicleBans.length > 0;
  if (isBlockingStatus(zone.status) || bansSomething) needed.push(ZONE_PERMISSION_CLOSE);

  const mult = Number(fx.rateMultiplier);
  const pct  = Number(fx.surchargePct);
  const fuel = fx.fuelPriceOverride;
  const movesMoney =
    (Number.isFinite(mult) && mult > 0 && mult !== 1) ||
    (Number.isFinite(pct) && pct !== 0) ||
    (!!fuel && (Number(fuel.petrolNgn) > 0 || Number(fuel.dieselNgn) > 0)) ||
    zone.status === 'surcharged';
  if (movesMoney) needed.push(ZONE_PERMISSION_PRICE);

  return needed;
}

/**
 * Permissions needed to move a zone FROM one state TO another.
 *
 * The union of both sides, deliberately. Checking only the incoming row
 * would let someone holding nothing but zones.price take a live curfew,
 * set it to 'open', and reopen an evacuated area with a pricing
 * permission. You need authority over the state you are leaving as much
 * as over the state you are entering.
 */
export function permissionsForTransition(
  existing: ZoneDraft | null | undefined,
  next: ZoneDraft | null | undefined,
): ZonePermission[] {
  const set = new Set<ZonePermission>([
    ...permissionsRequiredBy(existing),
    ...permissionsRequiredBy(next),
  ]);
  return Array.from(set);
}

/** Does this permission list satisfy `needed`? '*' is the seeded super-admin grant. */
export function permsSatisfy(held: string[], needed: ZonePermission[]): boolean {
  if (needed.length === 0) return true;
  if (held.indexOf('*') >= 0) return true;
  return needed.every(p => held.indexOf(p) >= 0);
}

/** Human sentence for a refusal, so the admin is told which half they are missing. */
export function missingPermissionMessage(missing: ZonePermission[]): string {
  const labels = missing.map(p =>
    p === ZONE_PERMISSION_CLOSE
      ? 'close or reopen an area (zones.close)'
      : 'change what an area costs (zones.price)');
  return 'You do not have permission to ' + labels.join(' or ') + '. Ask a super admin to grant it.';
}
