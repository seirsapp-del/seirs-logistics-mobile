import { withinWorkingHours } from './working-hours';

/**
 * 2026-09-05 is a Saturday and 2026-09-06 a Sunday.
 *
 * withinWorkingHours adds an hour for Lagos (UTC+1), so these build a UTC
 * instant one hour BEHIND the Lagos wall-clock time under test. Writing it
 * this way round means each case reads as the time a rider would see.
 */
const at = (y: number, mo: number, d: number, h: number, mi: number) =>
  new Date(Date.UTC(y, mo, d, h - 1, mi));

const off = { enabled: false, start: '00:00', end: '00:00' };

/** Works Saturday nights past midnight, and takes Sundays off. */
const nightRider = {
  mon: off, tue: off, wed: off, thu: off, fri: off,
  sat: { enabled: true, start: '18:00', end: '02:00' },
  sun: off,
};

const nineToFive = {
  mon: { enabled: true, start: '09:00', end: '17:00' },
  tue: { enabled: true, start: '09:00', end: '17:00' },
  wed: { enabled: true, start: '09:00', end: '17:00' },
  thu: { enabled: true, start: '09:00', end: '17:00' },
  fri: { enabled: true, start: '09:00', end: '17:00' },
  sat: off, sun: off,
};

/** Saturday, but a day shift, so nothing spills into Sunday. */
const satDayShift = {
  mon: off, tue: off, wed: off, thu: off, fri: off,
  sat: { enabled: true, start: '09:00', end: '17:00' },
  sun: off,
};

describe('withinWorkingHours', () => {
  describe('an overnight shift', () => {
    it('is working before midnight', () => {
      expect(withinWorkingHours(nightRider, at(2026, 8, 5, 19, 0))).toBe(true);
    });

    /**
     * The regression this file exists for.
     *
     * Until 2026-09-04 the lookup asked for TODAY's row, so at 01:00 on Sunday
     * it read Sunday (not working) rather than the Saturday shift still
     * running. The last two hours of every overnight shift computed as
     * "outside working hours", and a night rider stopped being offered jobs at
     * precisely the hour they were out working.
     */
    it('is still working after midnight, on the tail of the previous day', () => {
      expect(withinWorkingHours(nightRider, at(2026, 8, 6, 1, 0))).toBe(true);
      expect(withinWorkingHours(nightRider, at(2026, 8, 6, 1, 59))).toBe(true);
    });

    it('has stopped once the tail ends', () => {
      expect(withinWorkingHours(nightRider, at(2026, 8, 6, 2, 0))).toBe(false);
      expect(withinWorkingHours(nightRider, at(2026, 8, 6, 9, 0))).toBe(false);
    });

    it('has not started before the shift begins', () => {
      expect(withinWorkingHours(nightRider, at(2026, 8, 5, 17, 0))).toBe(false);
    });

    it('does not invent a tail when yesterday was a day shift', () => {
      expect(withinWorkingHours(satDayShift, at(2026, 8, 6, 1, 0))).toBe(false);
    });
  });

  describe('ordinary hours', () => {
    it('is working inside them', () => {
      expect(withinWorkingHours(nineToFive, at(2026, 8, 2, 12, 0))).toBe(true);
    });
    it('is not working after them', () => {
      expect(withinWorkingHours(nineToFive, at(2026, 8, 2, 18, 0))).toBe(false);
    });
    it('is not working in the small hours when nothing wraps', () => {
      expect(withinWorkingHours(nineToFive, at(2026, 8, 2, 1, 0))).toBe(false);
    });
  });

  /**
   * The header on working-hours.ts promises this and it matters more than any
   * case above: a bug in that function must never be able to take somebody's
   * income away silently, so anything unreadable means yes.
   */
  describe('fails open', () => {
    it('says yes when no hours are set', () => {
      expect(withinWorkingHours(null,      at(2026, 8, 6, 3, 0))).toBe(true);
      expect(withinWorkingHours(undefined, at(2026, 8, 6, 3, 0))).toBe(true);
    });
    it('says yes when a day is not described', () => {
      expect(withinWorkingHours({ mon: nineToFive.mon }, at(2026, 8, 6, 3, 0))).toBe(true);
    });
    it('says yes when the times are unreadable', () => {
      expect(withinWorkingHours(
        { sun: { enabled: true, start: 'xx', end: 'yy' } },
        at(2026, 8, 6, 3, 0),
      )).toBe(true);
    });
  });
});
