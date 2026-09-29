// Periods (BR-05): pure functions on `YYYY-MM-DD` strings, shared by the transaction
// list and budgets now, and the dashboard and reports later.
import {
  addDays,
  differenceInCalendarDays,
  format,
  getISODay,
  lastDayOfMonth,
  parseISO,
} from 'date-fns';

/** An inclusive range of local calendar dates, `YYYY-MM-DD` (BR-06). */
export interface DateRange {
  start: string;
  end: string;
}

/** The periods the transaction list offers (LST-02). */
export const PERIOD_PRESETS = ['this_month', 'last_month', 'this_year', 'custom'] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

/** Ranges longer than this load in pages instead of at once (LST-04). */
export const MAX_UNPAGED_DAYS = 366;

const ymd = (date: Date) => format(date, 'yyyy-MM-dd');

/** Month start days run 1–28, so every month has the day (§8 `monthStartDay`). */
export function clampStartDay(day: number): number {
  return Math.min(28, Math.max(1, Math.trunc(day) || 1));
}

/**
 * The month period that contains `today`, or the one `offset` periods away
 * (BR-05). With start day D it runs from day D to day D−1 of the next month:
 * D = 25 on 10 Sep gives 25 Aug – 24 Sep, and on 26 Sep gives 25 Sep – 24 Oct.
 */
export function monthPeriod(today: string, startDay: number, offset = 0): DateRange {
  const day = clampStartDay(startDay);
  const date = parseISO(today);
  const month = date.getMonth() - (date.getDate() < day ? 1 : 0) + offset;
  // Date() rolls months past 11 or below 0 into the next or previous year.
  const start = new Date(date.getFullYear(), month, day);
  const end = addDays(new Date(date.getFullYear(), month + 1, day), -1);
  return { start: ymd(start), end: ymd(end) };
}

/** Week start days are ISO weekdays, 1 = Monday … 7 = Sunday (§8 `weekStartDay`). */
export function clampWeekday(day: number): number {
  return Math.min(7, Math.max(1, Math.trunc(day) || 1));
}

/**
 * The seven days from the week start day that contain `today`, or the week
 * `offset` weeks away. With Monday (1), Sunday 27 Sep 2026 is in 21–27 Sep.
 */
export function weekPeriod(today: string, weekStartDay: number, offset = 0): DateRange {
  const date = parseISO(today);
  const sinceStart = (getISODay(date) - clampWeekday(weekStartDay) + 7) % 7;
  const start = addDays(date, offset * 7 - sinceStart);
  return { start: ymd(start), end: ymd(addDays(start, 6)) };
}

/**
 * The budget year that contains `today`, or the one `offset` years away: twelve
 * month periods (BR-05), starting with the one that contains 1 January, so a
 * yearly budget lines up with twelve monthly ones. With start day 1 that's the
 * calendar year; with start day 25 it runs 25 Dec – 24 Dec.
 */
export function budgetYearPeriod(today: string, startDay: number, offset = 0): DateRange {
  const firstStart = (year: number) => monthPeriod(`${year}-01-01`, startDay).start;
  let year = Number(today.slice(0, 4));
  // Late December can already be in next year's first period.
  if (today >= firstStart(year + 1)) year += 1;
  year += offset;
  return { start: firstStart(year), end: ymd(addDays(parseISO(firstStart(year + 1)), -1)) };
}

/** The calendar year that contains `today`. */
export function yearPeriod(today: string): DateRange {
  const year = today.slice(0, 4);
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/** The range a preset stands for on `today`; `custom` returns the given range, in order. */
export function presetRange(
  preset: PeriodPreset,
  today: string,
  startDay: number,
  custom: DateRange,
): DateRange {
  switch (preset) {
    case 'this_month':
      return monthPeriod(today, startDay);
    case 'last_month':
      return monthPeriod(today, startDay, -1);
    case 'this_year':
      return yearPeriod(today);
    case 'custom':
      return orderedRange(custom.start, custom.end);
  }
}

/** The two dates as a range, earlier one first. */
export function orderedRange(a: string, b: string): DateRange {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

/** Whether the date falls in the range, both ends included. */
export function inRange(date: string, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

/** Whether both are the same dates, or both missing; an `equal` for signals holding ranges. */
export function sameRange(a: DateRange | null, b: DateRange | null): boolean {
  return a === b || (!!a && !!b && a.start === b.start && a.end === b.end);
}

/** Whether `outer` includes every day of `inner`. */
export function coversRange(outer: DateRange, inner: DateRange): boolean {
  return outer.start <= inner.start && outer.end >= inner.end;
}

/** The shortest range that covers all of them, or null for none. */
export function spanOf(ranges: readonly DateRange[]): DateRange | null {
  if (!ranges.length) return null;
  let { start, end } = ranges[0];
  for (const range of ranges) {
    if (range.start < start) start = range.start;
    if (range.end > end) end = range.end;
  }
  return { start, end };
}

/**
 * The `count` ranges of the same length that come right before `range`,
 * oldest first: what "the previous period" means for a custom range (DSH-10).
 */
export function previousRanges(range: DateRange, count: number): DateRange[] {
  const days = daysIn(range);
  const start = parseISO(range.start);
  return Array.from({ length: count }, (_, i) => {
    const back = (count - i) * days;
    return { start: ymd(addDays(start, -back)), end: ymd(addDays(start, -back + days - 1)) };
  });
}

/** How many days the range covers, both ends included. */
export function daysIn(range: DateRange): number {
  return differenceInCalendarDays(parseISO(range.end), parseISO(range.start)) + 1;
}

/** Whether the range is exactly one calendar month, which is labelled by its name. */
export function isCalendarMonth(range: DateRange): boolean {
  return (
    range.start.endsWith('-01') &&
    range.start.slice(0, 7) === range.end.slice(0, 7) &&
    range.end === ymd(lastDayOfMonth(parseISO(range.start)))
  );
}

/** Whether the range is exactly one calendar year. */
export function isCalendarYear(range: DateRange): boolean {
  const year = range.start.slice(0, 4);
  return range.start === `${year}-01-01` && range.end === `${year}-12-31`;
}

/**
 * How a period reads: "September 2026" for a calendar month, "2026" for a
 * calendar year, otherwise the date range ("25 Sep – 24 Oct 2026"), so a month
 * with a start day other than 1 never shows a month name (BR-05).
 */
export function formatPeriod(range: DateRange, locale: string): string {
  const start = parseISO(range.start);
  if (isCalendarYear(range)) {
    return new Intl.DateTimeFormat(locale, { year: 'numeric' }).format(start);
  }
  if (isCalendarMonth(range)) {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(start);
  }
  const formatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return formatter.formatRange(start, parseISO(range.end));
}
