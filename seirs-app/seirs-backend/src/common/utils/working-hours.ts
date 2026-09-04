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

/**
 * Are they working right now?
 *
 * Moved out of drivers/ on 2026-09-03 because partner stores need the
 * same answer and had a SECOND implementation of it, isOpenNow in
 * partner-store.service, which could not express a shop open past
 * midnight: it tested mins >= 1080 && mins < 120, which is never true,
 * so an 18:00 to 02:00 kiosk computed as closed forever.
 *
 * One implementation, two owner types. deliveries.service already
 * imported this across module boundaries, so common/utils is where it
 * belonged already.
 */
export function withinWorkingHours(hours: WorkingHours, now: Date = new Date()): boolean {
  if (!hours) return true;
  try {
    // Lagos is UTC+1 all year, so this needs no timezone database.
    const lagos = new Date(now.getTime() + 60 * 60 * 1000);
    const mins  = lagos.getUTCHours() * 60 + lagos.getUTCMinutes();

    const parse = (t: string): number | null => {
      const [h, m] = String(t ?? '').split(':').map(Number);
      return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
    };

    /**
     * The TAIL of yesterday's overnight shift, which lands on today's date.
     *
     * The wrap on the last line of this function covers 18:00-02:00 while it
     * is still Saturday. It cannot cover 01:00 on Sunday, because by then
     * getUTCDay() reads SUNDAY's row, and a rider who works Saturday nights
     * and takes Sundays off has Sunday marked as not working. So the last two
     * hours of every overnight shift computed as "outside working hours": no
     * new jobs offered, at exactly the hour a night rider is out working.
     *
     * Flagged by the other session on 2026-09-04 while fixing the same
     * midnight bug in the partner-store copies. It is the same fault as the
     * isOpenNow one described above, one layer further out: that one could not
     * express an overnight window at all, this one expresses it and then looks
     * it up on the wrong day.
     *
     * This check can only ever return TRUE, never false, so it widens
     * availability and never withdraws it. That keeps the fail-open promise in
     * the header intact.
     */
    const prev = hours[DAY_KEYS[(lagos.getUTCDay() + 6) % 7]];
    if (prev && prev.enabled !== false) {
      const pFrom = parse(prev.start);
      const pTo   = parse(prev.end);
      // Only a WRAPPING window has a tail that reaches into today.
      if (pFrom != null && pTo != null && pFrom > pTo && mins < pTo) return true;
    }

    const day = hours[DAY_KEYS[lagos.getUTCDay()]];
    if (!day) return true;            // day not described is not a refusal
    if (!day.enabled) return false;   // explicitly not working today

    const from = parse(day.start);
    const to   = parse(day.end);
    if (from == null || to == null) return true;   // unreadable is not a refusal

    // An overnight shift wraps past midnight: 22:00 to 06:00.
    return from <= to ? mins >= from && mins < to : mins >= from || mins < to;
  } catch {
    return true;
  }
}
