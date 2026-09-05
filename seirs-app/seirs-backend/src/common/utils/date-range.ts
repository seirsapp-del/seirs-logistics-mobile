/**
 * Turning a YYYY-MM-DD from a query string into a range the database can use.
 *
 * Written because the same eight lines were copied onto every admin board
 * that gained a date filter, and two properties of those lines are easy to
 * get wrong in ways nothing catches.
 *
 * THE END DATE COVERS ITS WHOLE DAY. A range ending on the 5th that stops
 * at midnight excludes everything that happened ON the 5th. That is the
 * commonest date-filter bug and the least likely to be reported, because
 * the result still looks like a plausible list. On an audit log it is
 * worse than plausible: somebody asks what happened on the 3rd, ranges the
 * 3rd to the 3rd, and is shown an empty page that reads as "nothing
 * happened". So `to` returns the START of the following day and every
 * caller compares with `<`, never `<=`.
 *
 * AN UNREADABLE DATE IS IGNORED, NOT REJECTED. `new Date('rubbish')` is an
 * Invalid Date, and passing one into a query yields either an error or,
 * worse, silently matches nothing. A filter that 500s on a typo is worse
 * than one that shows too much: the person retypes and moves on, rather
 * than believing there is no data. Adopted from the other session, which
 * did this on the trip boards first.
 *
 * Everything is treated as UTC. The columns are timestamptz and the
 * platform's other time handling already fixes Lagos at UTC+1 with no
 * daylight saving, so a date here means the calendar day, not a window
 * shifted by whoever's laptop is asking.
 */

/** Start of the given day, or null if the string is not a usable date. */
export function rangeStart(value?: string | null): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const d = new Date(`${value.trim()}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Start of the day AFTER the given one, so a caller can write `< end` and
 * include the whole of the end date. Null if the string is unusable.
 */
export function rangeEnd(value?: string | null): Date | null {
  const start = rangeStart(value);
  return start ? new Date(start.getTime() + 86_400_000) : null;
}
