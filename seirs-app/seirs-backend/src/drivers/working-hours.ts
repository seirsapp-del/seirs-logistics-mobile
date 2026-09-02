/**
 * Is a rider inside their own declared working hours?
 *
 * A pure function in its own file because two services need it and they
 * cannot import each other: DeliveriesService holds DriversService as an
 * untyped property specifically to avoid a circular import.
 *
 * FAILS OPEN, and that is the whole design. Null hours, a day that is not
 * described, an unreadable time, or any thrown error all mean yes. A rider
 * who has never opened that screen must keep every job they had, and a bug
 * in here must never be able to take somebody's income away silently. The
 * only case that returns false is an explicit one: a day the rider marked
 * as not working, or a time outside a window they set themselves.
 */
export type WorkingHours =
  Record<string, { enabled: boolean; start: string; end: string }> | null | undefined;

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function withinWorkingHours(hours: WorkingHours, now: Date = new Date()): boolean {
  if (!hours) return true;
  try {
    // Lagos is UTC+1 all year, so this needs no timezone database.
    const lagos = new Date(now.getTime() + 60 * 60 * 1000);
    const day   = hours[DAY_KEYS[lagos.getUTCDay()]];
    if (!day) return true;            // day not described is not a refusal
    if (!day.enabled) return false;   // explicitly not working today

    const parse = (t: string): number | null => {
      const [h, m] = String(t ?? '').split(':').map(Number);
      return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
    };
    const from = parse(day.start);
    const to   = parse(day.end);
    if (from == null || to == null) return true;   // unreadable is not a refusal

    const mins = lagos.getUTCHours() * 60 + lagos.getUTCMinutes();
    // An overnight shift wraps past midnight: 22:00 to 06:00.
    return from <= to ? mins >= from && mins < to : mins >= from || mins < to;
  } catch {
    return true;
  }
}
