import type { ZoneActiveWindow, ZoneStatus } from './zone.entity';

/**
 * Statuses that refuse work rather than reprice it.
 *
 * Kept here because both the engine and the permission check need the
 * same answer to "is this a safety statement or a pricing rule", and two
 * copies of that list would eventually disagree.
 */
export const BLOCKING_STATUSES: ZoneStatus[] = ['no_pickup', 'no_dropoff', 'closed'];

export function isBlockingStatus(status: ZoneStatus): boolean {
  return BLOCKING_STATUSES.includes(status);
}

/** 'HH:MM' to minutes past local midnight, or null when it is not a real time. */
export function parseHhmm(value?: string | null): number | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Minutes past local midnight, at a FIXED offset from UTC.
 *
 * Date.getHours() reads the server's own timezone, and the backend
 * deploys to hosts that run in UTC while a curfew is always stated in
 * Nigerian local time. A one-hour error on a night surcharge is a
 * rounding argument; a one-hour error on a 6pm curfew sends a rider into
 * a closed area, so this one converts explicitly instead of trusting the
 * host clock. Nigeria observes WAT (UTC+1) all year with no daylight
 * saving, and the offset is a settable knob rather than a literal so a
 * deploy elsewhere is a config change, not a code change.
 */
export function localMinutesAt(at: Date, utcOffsetMinutes: number): number {
  const utcMins = at.getUTCHours() * 60 + at.getUTCMinutes();
  return ((utcMins + utcOffsetMinutes) % 1440 + 1440) % 1440;
}

/** Inside [from, to)? Wrap-around is what makes an overnight curfew expressible. */
export function withinDailyWindow(minutes: number, from: number, to: number): boolean {
  if (from === to) return true;                        // a full day
  return from < to ? minutes >= from && minutes < to
                   : minutes >= from || minutes < to;  // 18:00 to 06:00
}

/**
 * Is this zone live at the given instant?
 *
 * `at` is the instant that MATTERS, which is not always now. A booking
 * scheduled for 7pm inside a 6pm curfew has to fail at 2pm while it is
 * still fixable, so callers pass the scheduled time and this answers for
 * that moment. Evaluating "now" for a future booking would sell someone
 * a pickup nobody can make.
 *
 * A malformed window resolves in the safe direction FOR ITS OWN STATUS:
 * a blocking zone with an unreadable window is treated as active, and a
 * pricing zone with one is treated as inactive. A broken curfew that
 * quietly lets work continue in a closed area is the worse of the two
 * failures by a wide margin, while a broken surcharge that quietly
 * charges nothing is merely the state the platform is in today. Writes
 * are validated so this should never fire on data the admin page
 * produced; it exists for rows edited by hand.
 */
export function isZoneActiveAt(
  active: ZoneActiveWindow | null | undefined,
  status: ZoneStatus,
  at: Date,
  utcOffsetMinutes: number,
): boolean {
  const failSafe = isBlockingStatus(status);
  if (!active || typeof active !== 'object') return failSafe;

  switch (active.mode) {
    case 'always':
      return true;

    case 'daily': {
      const from = parseHhmm(active.dailyFrom);
      const to   = parseHhmm(active.dailyTo);
      if (from === null || to === null) return failSafe;
      return withinDailyWindow(localMinutesAt(at, utcOffsetMinutes), from, to);
    }

    case 'dateRange': {
      const startsAt = active.startsAt ? new Date(active.startsAt) : null;
      const endsAt   = active.endsAt   ? new Date(active.endsAt)   : null;
      const badStart = startsAt !== null && Number.isNaN(startsAt.getTime());
      const badEnd   = endsAt   !== null && Number.isNaN(endsAt.getTime());
      if (badStart || badEnd) return failSafe;
      // An open-ended bound is legitimate: "closed from Friday 6pm until
      // further notice" is exactly how an emergency is declared.
      if (startsAt && at.getTime() <  startsAt.getTime()) return false;
      if (endsAt   && at.getTime() >= endsAt.getTime())   return false;
      return true;
    }

    default:
      return failSafe;
  }
}
