import { PartnerStoreService } from './partner-store.service';

/**
 * What a sender is billed for leaving a parcel at a shop.
 *
 * This is money, and until 2026-09-04 it disagreed with the clock beside
 * it: the escalation timer counted WORKING days while the charge counted
 * every calendar hour. A shop shut for three days over a festive period
 * left the sender unable to collect and billed for all three, and nobody
 * was on the other side of that charge, because storage is only ever read
 * as an amount the SENDER owes and never reaches a partner payout.
 *
 * These cases were originally run as a throwaway node script against the
 * compiled dist, which proved the fix once and then proved nothing ever
 * again. They are written down here so the next person to touch
 * storageOwed finds out immediately rather than at a customer's expense.
 *
 * storageOwed is private and takes no dependencies, so the prototype is
 * borrowed rather than standing up the whole Nest module. That is a
 * deliberate trade: it tests the arithmetic, which is what breaks, and not
 * the wiring.
 */
describe('storageOwed', () => {
  const svc = Object.create(PartnerStoreService.prototype) as any;
  const owed = (
    arrived: string,
    now: string,
    freeHours: number,
    perDay: number,
    hours?: Record<string, { enabled: boolean; start: string; end: string }> | null,
  ) => svc.storageOwed(new Date(arrived + 'Z'), new Date(now + 'Z'), freeHours, perDay, hours);

  const day = (enabled: boolean, start = '08:00', end = '18:00') => ({ enabled, start, end });

  // 2026-09-05 is a Saturday.
  const shutSunMon = {
    mon: day(false), tue: day(true), wed: day(true), thu: day(true),
    fri: day(true), sat: day(true), sun: day(false),
  };
  const openEveryDay = {
    mon: day(true), tue: day(true), wed: day(true), thu: day(true),
    fri: day(true), sat: day(true), sun: day(true),
  };

  // Arrives Sat 09:00, 24h free, so the clock starts Sun 09:00 and four
  // 24-hour periods begin: Sunday, Monday, Tuesday, Wednesday.
  const ARRIVED = '2026-09-05T09:00:00';
  const LATER   = '2026-09-09T10:00:00';

  it('does not charge for the days the shop was shut', () => {
    // Sunday and Monday are closed, so only Tuesday and Wednesday count.
    expect(owed(ARRIVED, LATER, 24, 200, shutSunMon)).toBe(400);
  });

  it('charges every day when the shop is open every day', () => {
    expect(owed(ARRIVED, LATER, 24, 200, openEveryDay)).toBe(800);
  });

  it('charges every day when the shop has never set hours', () => {
    /**
     * The unchanged path, and it must stay unchanged. Null hours mean the
     * shop never answered, and a store that never answered is treated as
     * open everywhere else in the system too.
     */
    expect(owed(ARRIVED, LATER, 24, 200, null)).toBe(800);
  });

  it('charges nothing inside the free window', () => {
    expect(owed(ARRIVED, '2026-09-06T08:00:00', 24, 200, shutSunMon)).toBe(0);
  });

  it('charges nothing at all when the shop never opens', () => {
    const neverOpen = {
      mon: day(false), tue: day(false), wed: day(false), thu: day(false),
      fri: day(false), sat: day(false), sun: day(false),
    };
    expect(owed(ARRIVED, LATER, 24, 200, neverOpen)).toBe(0);
  });

  it('counts a day the shop did not describe, rather than assuming it closed', () => {
    // Silence is not a claim to be closed, the same rule as null hours.
    const partial = { tue: day(true), wed: day(true) } as any;
    expect(owed(ARRIVED, LATER, 24, 200, partial)).toBe(800);
  });

  it('steps in exact 24-hour blocks, not by local calendar date', () => {
    /**
     * Guards a real bug that was fixed before shipping: the loop used
     * setDate(+1), which walks the SERVER's local calendar, while the day
     * of the week is read in UTC. On a host with daylight saving the two
     * disagree twice a year and a parcel gains or loses a day of storage.
     *
     * Exactly three 24-hour periods after the free window, all open.
     */
    expect(owed('2026-09-07T00:00:00', '2026-09-10T00:00:00', 24, 200, openEveryDay)).toBe(400);
  });
});
