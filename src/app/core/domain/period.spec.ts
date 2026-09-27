import {
  budgetYearPeriod,
  clampStartDay,
  clampWeekday,
  coversRange,
  daysIn,
  formatPeriod,
  inRange,
  isCalendarMonth,
  monthPeriod,
  orderedRange,
  presetRange,
  spanOf,
  weekPeriod,
  yearPeriod,
} from './period';

describe('periods (BR-05)', () => {
  describe('monthPeriod', () => {
    it('is the calendar month when the month starts on day 1', () => {
      expect(monthPeriod('2026-09-27', 1)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
      expect(monthPeriod('2026-02-01', 1)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
      expect(monthPeriod('2028-02-29', 1)).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    });

    it('runs from day D to day D−1 and contains today', () => {
      expect(monthPeriod('2026-09-10', 25)).toEqual({ start: '2026-08-25', end: '2026-09-24' });
      expect(monthPeriod('2026-09-25', 25)).toEqual({ start: '2026-09-25', end: '2026-10-24' });
    });

    it('covers 25 Sep – 24 Oct on 26 Sep with start day 25 (US-06)', () => {
      expect(monthPeriod('2026-09-26', 25)).toEqual({ start: '2026-09-25', end: '2026-10-24' });
    });

    it('steps back and forward across year ends', () => {
      expect(monthPeriod('2026-01-15', 1, -1)).toEqual({ start: '2025-12-01', end: '2025-12-31' });
      expect(monthPeriod('2026-01-10', 25, -1)).toEqual({
        start: '2025-11-25',
        end: '2025-12-24',
      });
      expect(monthPeriod('2026-12-28', 28, 1)).toEqual({ start: '2027-01-28', end: '2027-02-27' });
    });

    it('keeps the start day within 1–28', () => {
      expect(clampStartDay(0)).toBe(1);
      expect(clampStartDay(31)).toBe(28);
      expect(clampStartDay(12.7)).toBe(12);
      expect(monthPeriod('2026-03-30', 31)).toEqual({ start: '2026-03-28', end: '2026-04-27' });
    });
  });

  describe('weekPeriod', () => {
    it('runs seven days from the week start day and contains today', () => {
      // Sunday 27 Sep 2026.
      expect(weekPeriod('2026-09-27', 1)).toEqual({ start: '2026-09-21', end: '2026-09-27' });
      expect(weekPeriod('2026-09-21', 1)).toEqual({ start: '2026-09-21', end: '2026-09-27' });
      expect(weekPeriod('2026-09-27', 7)).toEqual({ start: '2026-09-27', end: '2026-10-03' });
      expect(weekPeriod('2026-09-26', 7)).toEqual({ start: '2026-09-20', end: '2026-09-26' });
    });

    it('steps across months and years', () => {
      expect(weekPeriod('2026-01-02', 1, -1)).toEqual({ start: '2025-12-22', end: '2025-12-28' });
      expect(weekPeriod('2026-09-27', 1, 1)).toEqual({ start: '2026-09-28', end: '2026-10-04' });
    });

    it('keeps the week start day within 1–7', () => {
      expect(clampWeekday(0)).toBe(1);
      expect(clampWeekday(9)).toBe(7);
      expect(weekPeriod('2026-09-27', 0)).toEqual(weekPeriod('2026-09-27', 1));
    });
  });

  describe('budgetYearPeriod', () => {
    it('is the calendar year when the month starts on day 1', () => {
      expect(budgetYearPeriod('2026-09-27', 1)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
      expect(budgetYearPeriod('2026-12-31', 1)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    });

    it('is twelve month periods, from the one that contains 1 January', () => {
      expect(budgetYearPeriod('2026-09-27', 25)).toEqual({
        start: '2025-12-25',
        end: '2026-12-24',
      });
      // From 25 Dec the next year's first period has begun.
      expect(budgetYearPeriod('2026-12-25', 25)).toEqual({
        start: '2026-12-25',
        end: '2027-12-24',
      });
      expect(budgetYearPeriod('2026-12-24', 25).start).toBe('2025-12-25');
    });

    it('steps by whole years', () => {
      expect(budgetYearPeriod('2026-09-27', 25, -1)).toEqual({
        start: '2024-12-25',
        end: '2025-12-24',
      });
      expect(budgetYearPeriod('2026-09-27', 1, 1)).toEqual({
        start: '2027-01-01',
        end: '2027-12-31',
      });
    });
  });

  it('checks, compares and spans ranges', () => {
    const september = { start: '2026-09-01', end: '2026-09-30' };
    expect(inRange('2026-09-01', september)).toBe(true);
    expect(inRange('2026-09-30', september)).toBe(true);
    expect(inRange('2026-10-01', september)).toBe(false);
    expect(coversRange(september, { start: '2026-09-21', end: '2026-09-27' })).toBe(true);
    expect(coversRange(september, { start: '2026-09-28', end: '2026-10-04' })).toBe(false);
    expect(spanOf([september, { start: '2026-08-25', end: '2026-09-24' }])).toEqual({
      start: '2026-08-25',
      end: '2026-09-30',
    });
    expect(spanOf([])).toBeNull();
  });

  it('gives the calendar year for this year', () => {
    expect(yearPeriod('2026-09-27')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });

  it('resolves each preset of the list (LST-02)', () => {
    const custom = { start: '2026-09-20', end: '2026-09-01' };
    expect(presetRange('this_month', '2026-09-27', 1, custom).start).toBe('2026-09-01');
    expect(presetRange('last_month', '2026-09-27', 1, custom)).toEqual({
      start: '2026-08-01',
      end: '2026-08-31',
    });
    expect(presetRange('this_year', '2026-09-27', 25, custom).start).toBe('2026-01-01');
    expect(presetRange('custom', '2026-09-27', 1, custom)).toEqual({
      start: '2026-09-01',
      end: '2026-09-20',
    });
  });

  it('orders ranges and counts their days inclusively', () => {
    expect(orderedRange('2026-09-30', '2026-09-01')).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    });
    expect(daysIn({ start: '2026-09-01', end: '2026-09-01' })).toBe(1);
    expect(daysIn({ start: '2026-01-01', end: '2026-12-31' })).toBe(365);
    expect(daysIn({ start: '2026-03-28', end: '2026-03-30' })).toBe(3);
  });

  it('knows a calendar month from a shifted one', () => {
    expect(isCalendarMonth({ start: '2026-09-01', end: '2026-09-30' })).toBe(true);
    expect(isCalendarMonth({ start: '2026-09-01', end: '2026-09-29' })).toBe(false);
    expect(isCalendarMonth({ start: '2026-09-25', end: '2026-10-24' })).toBe(false);
  });

  describe('formatPeriod', () => {
    it('names a calendar month or year', () => {
      expect(formatPeriod({ start: '2026-09-01', end: '2026-09-30' }, 'en-US')).toBe(
        'September 2026',
      );
      expect(formatPeriod({ start: '2026-01-01', end: '2026-12-31' }, 'en-US')).toBe('2026');
    });

    it('shows the date range, not a month name, when the month starts later (BR-05)', () => {
      const label = formatPeriod({ start: '2026-09-25', end: '2026-10-24' }, 'en-GB');
      // ICU puts thin spaces around the dash in some versions.
      expect(label).toMatch(/^25 Sept?\s–\s24 Oct 2026$/);
      expect(label).not.toContain('September');
    });
  });
});
