// Recurring rules (§3.9, BR-09): pure functions on `YYYY-MM-DD` strings, mirrored in
// Kotlin. The web app generates occurrences from these now; the v1.1 generateRecurring
// Function (§12) must reach the same dates and IDs, so both stay exactly-once (REC-05).
import {
  addDays,
  addMonths,
  addYears,
  differenceInCalendarDays,
  format,
  getDaysInMonth,
  getISODay,
  parseISO,
} from 'date-fns';
import { Frequency, RecurringRule, RecurringTemplate, Schedule } from '../models/recurring';
import { NewTransaction } from '../models/transaction';

/** Largest "every N" the form accepts. */
export const MAX_INTERVAL = 99;
/** Most occurrences a `count` rule can end after. */
export const MAX_OCCURRENCES = 999;
/**
 * Most occurrences one catch-up write creates (REC-06). Each takes one document
 * plus the balance increments, so a write stays well under Firestore's 500.
 */
export const CATCH_UP_LIMIT = 100;

const ymd = (date: Date) => format(date, 'yyyy-MM-dd');

/**
 * An occurrence's document ID, `{ruleId}_{YYYYMMDD}` (§8 IDs). It depends only on
 * the rule and the schedule date, so every device and the server job name the
 * same occurrence the same way and can check whether it exists (REC-05).
 */
export function occurrenceId(ruleId: string, date: string): string {
  return `${ruleId}_${date.replaceAll('-', '')}`;
}

function intervalOf(schedule: Pick<Schedule, 'interval'>): number {
  return Math.max(1, Math.trunc(schedule.interval) || 1);
}

/** The rule's weekdays in order; a weekly rule without any repeats on its start date's weekday. */
export function weekdaysOf(schedule: Pick<Schedule, 'weekdays' | 'startDate'>): number[] {
  const days = [...new Set(schedule.weekdays)]
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
    .sort((a, b) => a - b);
  return days.length ? days : [getISODay(parseISO(schedule.startDate))];
}

/** The rule's day of the month, 1–31; a monthly rule without one repeats on its start date's day. */
export function dayOfMonthOf(schedule: Pick<Schedule, 'dayOfMonth' | 'startDate'>): number {
  const day = schedule.dayOfMonth;
  return day && day >= 1 && day <= 31 ? Math.trunc(day) : parseISO(schedule.startDate).getDate();
}

/** Day `day` of the month, or its last day when the month is shorter (BR-09). Months past 11 roll over. */
function dayInMonth(year: number, month: number, day: number): Date {
  return new Date(year, month, Math.min(day, getDaysInMonth(new Date(year, month, 1))));
}

/**
 * The first schedule date on or after `date` (and never before `startDate`),
 * ignoring how the rule ends (REC-02):
 * - daily: every `interval` days from the start date;
 * - weekly: the chosen ISO weekdays, every `interval` weeks counted in
 *   Monday-to-Sunday weeks from the week that contains the start date;
 * - monthly: day `dayOfMonth` (29–31 fall on the last day of shorter months,
 *   BR-09), every `interval` months counted from the start date's month;
 * - yearly: the start date's day and month every `interval` years (29 February
 *   falls on the 28th in other years).
 */
export function firstOnOrAfter(schedule: Schedule, date: string): string {
  const start = parseISO(schedule.startDate);
  const from = date > schedule.startDate ? parseISO(date) : start;
  const n = intervalOf(schedule);
  switch (schedule.frequency) {
    case 'daily': {
      const steps = Math.ceil(differenceInCalendarDays(from, start) / n);
      return ymd(addDays(start, steps * n));
    }
    case 'weekly':
      return ymd(firstWeekly(start, from, n, weekdaysOf(schedule)));
    case 'yearly': {
      const at = (k: number) =>
        dayInMonth(start.getFullYear() + k * n, start.getMonth(), start.getDate());
      const k = Math.ceil((from.getFullYear() - start.getFullYear()) / n);
      return ymd(at(k) < from ? at(k + 1) : at(k));
    }
    default: {
      // Monthly, and any frequency a newer app version adds, like an unknown budget period.
      const day = dayOfMonthOf(schedule);
      const at = (k: number) => dayInMonth(start.getFullYear(), start.getMonth() + k * n, day);
      const months =
        (from.getFullYear() - start.getFullYear()) * 12 + from.getMonth() - start.getMonth();
      const k = Math.ceil(months / n);
      return ymd(at(k) < from ? at(k + 1) : at(k));
    }
  }
}

function firstWeekly(start: Date, from: Date, n: number, days: readonly number[]): Date {
  // Weeks are numbered from the Monday of the week the rule starts in.
  const monday = addDays(start, 1 - getISODay(start));
  let week = Math.floor(differenceInCalendarDays(from, monday) / 7);
  let weekday = getISODay(from);
  for (;;) {
    const aligned = Math.ceil(week / n) * n;
    if (aligned !== week) {
      week = aligned;
      weekday = 1;
    }
    const day = days.find((d) => d >= weekday);
    if (day !== undefined) return addDays(monday, week * 7 + day - 1);
    week += 1;
    weekday = 1;
  }
}

/** The first schedule date after `date`. */
export function nextAfter(schedule: Schedule, date: string): string {
  return firstOnOrAfter(schedule, ymd(addDays(parseISO(date), 1)));
}

/** A new rule's first occurrence: the first schedule date on or after its start date. */
export function firstDueDate(schedule: Schedule): string {
  return firstOnOrAfter(schedule, schedule.startDate);
}

/**
 * The next due date after the schedule was edited (REC-07). Edits reach
 * future occurrences only, so it counts from today, or from an earlier date
 * still waiting to be confirmed so that one isn't lost.
 */
export function rescheduledDueDate(schedule: Schedule, nextDueDate: string, today: string): string {
  return firstOnOrAfter(schedule, nextDueDate < today ? nextDueDate : today);
}

/**
 * The next due date when a paused rule resumes (REC-07): dates that passed
 * while it was paused are left out, and nothing already handled comes back.
 */
export function resumedDueDate(schedule: Schedule, nextDueDate: string, today: string): string {
  return firstOnOrAfter(schedule, nextDueDate > today ? nextDueDate : today);
}

type RuleState = Schedule &
  Pick<RecurringRule, 'endType' | 'endDate' | 'maxCount' | 'occurrences' | 'nextDueDate'>;

/** Whether the rule has run its course (REC-03): its count is reached or its next date is past the end date. */
export function isEnded(rule: RuleState): boolean {
  if (rule.endType === 'count') return rule.maxCount !== null && rule.occurrences >= rule.maxCount;
  if (rule.endType === 'until') return !!rule.endDate && rule.nextDueDate > rule.endDate;
  return false;
}

/**
 * The rule's next `limit` occurrence dates from `nextDueDate`, stopping where
 * it ends (REC-03) and, when given, after `through`. A `count` rule assumes
 * each of them is created.
 */
export function pendingDates(rule: RuleState, limit: number, through?: string): string[] {
  const dates: string[] = [];
  let date = rule.nextDueDate;
  let count = rule.occurrences;
  while (dates.length < limit) {
    if (through !== undefined && date > through) break;
    if (rule.endType === 'until' && rule.endDate && date > rule.endDate) break;
    if (rule.endType === 'count' && rule.maxCount !== null && count >= rule.maxCount) break;
    dates.push(date);
    count += 1;
    date = nextAfter(rule, date);
  }
  return dates;
}

/**
 * The occurrences due by `today`, oldest first, including any missed while the
 * app was closed (REC-06). None while the rule is paused.
 */
export function dueDates(
  rule: RuleState & Pick<RecurringRule, 'active'>,
  today: string,
  limit = CATCH_UP_LIMIT,
): string[] {
  return rule.active ? pendingDates(rule, limit, today) : [];
}

/**
 * The occurrences from the rule's next date through `days` days after `today`,
 * oldest first (DSH-08): what's due now, and what's coming up. None while the
 * rule is paused.
 */
export function upcomingDates(
  rule: RuleState & Pick<RecurringRule, 'active'>,
  today: string,
  days: number,
  limit = CATCH_UP_LIMIT,
): string[] {
  if (!rule.active) return [];
  const through = format(addDays(parseISO(today), days), 'yyyy-MM-dd');
  return pendingDates(rule, limit, through);
}

/** The transaction a rule's occurrence on `date` is written as. */
export function occurrenceOf(
  ruleId: string,
  template: RecurringTemplate,
  date: string,
  currency: string,
): NewTransaction {
  const transfer = template.type === 'transfer';
  return {
    type: template.type,
    amount: template.amount,
    currency,
    accountId: template.accountId,
    toAccountId: transfer ? (template.toAccountId ?? null) : null,
    categoryId: transfer ? null : (template.categoryId ?? null),
    date,
    time: null,
    payee: template.payee ?? null,
    note: template.note ?? null,
    tags: [...template.tags],
    recurringRuleId: ruleId,
  };
}

/** A rule template from a transaction, for "Make recurring" (REC-01). */
export function templateOf(
  tx: Pick<
    NewTransaction,
    'type' | 'amount' | 'accountId' | 'toAccountId' | 'categoryId' | 'payee' | 'note' | 'tags'
  >,
): RecurringTemplate {
  const transfer = tx.type === 'transfer';
  return {
    type: tx.type,
    amount: tx.amount,
    accountId: tx.accountId,
    toAccountId: transfer ? (tx.toAccountId ?? null) : null,
    categoryId: transfer ? null : (tx.categoryId ?? null),
    payee: tx.payee ?? null,
    note: tx.note ?? null,
    tags: [...tx.tags],
  };
}

/**
 * A schedule that repeats a transaction dated `date` (REC-01): same weekday or
 * day of the month, starting one period later, so the transaction itself
 * isn't created again.
 */
export function scheduleAfter(date: string, frequency: Frequency): Schedule {
  const day = parseISO(date);
  const next =
    frequency === 'daily'
      ? addDays(day, 1)
      : frequency === 'weekly'
        ? addDays(day, 7)
        : frequency === 'yearly'
          ? addYears(day, 1)
          : addMonths(day, 1);
  return {
    frequency,
    interval: 1,
    weekdays: frequency === 'weekly' ? [getISODay(day)] : [],
    dayOfMonth: frequency === 'monthly' ? day.getDate() : null,
    startDate: ymd(next),
  };
}
