// Reminders (NTF-01, NTF-03): when they fall due, as pure functions on local
// `YYYY-MM-DD` dates and `HH:mm` times. The web app shows them on the device
// until the v1.1 dailyReminder and generateRecurring Functions push them (§12);
// those, and Android, follow the same rules.
import { addDays, format, parseISO } from 'date-fns';
import { RecurringRule } from '../models/recurring';
import { dueDates, isEnded, pendingDates } from './recurrence';

/** A 24-hour local time of day, `HH:mm` (BR-06). */
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isTimeOfDay(value: unknown): value is string {
  return typeof value === 'string' && TIME_OF_DAY.test(value);
}

/**
 * Milliseconds from `now` until `time` on now's local date: positive while it's
 * still ahead, 0 or less once it has passed.
 */
export function msUntilTime(time: string, now: Date): number {
  const [hours, minutes] = time.split(':').map(Number);
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
  return at.getTime() - now.getTime();
}

export interface DailyReminderState {
  enabled: boolean;
  /** The reminder time, `HH:mm`. */
  time: string;
  now: Date;
  /** Local date of `now`. */
  today: string;
  /** Whether anything is logged for today already. */
  loggedToday: boolean;
  /** The last date the reminder was shown, if ever. */
  lastShown: string | null;
}

/**
 * Whether the daily reminder to log expenses is due (NTF-01): it's on, today's
 * reminder time has come, nothing is logged for today yet, and it hasn't been
 * shown today. Once a day at most.
 */
export function dailyReminderDue(state: DailyReminderState): boolean {
  return (
    state.enabled &&
    isTimeOfDay(state.time) &&
    msUntilTime(state.time, state.now) <= 0 &&
    !state.loggedToday &&
    state.lastShown !== state.today
  );
}

/**
 * `upcoming`: the day before an entry is due. `due`: entries are due and wait
 * for Confirm or Skip (REC-04).
 */
export type BillReminderKind = 'upcoming' | 'due';

export interface BillReminder {
  ruleId: string;
  kind: BillReminderKind;
  /** The occurrence date: tomorrow's for `upcoming`, the latest waiting one for `due`. */
  date: string;
  /** How many occurrences wait; 1 for `upcoming`. */
  count: number;
}

type ReminderRule = Pick<
  RecurringRule,
  | 'id'
  | 'mode'
  | 'active'
  | 'frequency'
  | 'interval'
  | 'weekdays'
  | 'dayOfMonth'
  | 'startDate'
  | 'endType'
  | 'endDate'
  | 'maxCount'
  | 'occurrences'
  | 'nextDueDate'
>;

/**
 * The reminder an ask-first rule has now (NTF-03): `due` once occurrences wait
 * for Confirm or Skip, else `upcoming` when the next one is due tomorrow.
 * Automatic, paused and ended rules get none. A catch-up of several missed
 * dates is one reminder, named after the latest of them.
 */
export function billReminder(rule: ReminderRule, today: string): BillReminder | null {
  if (rule.mode !== 'confirm' || !rule.active || isEnded(rule)) return null;
  const due = dueDates(rule, today);
  if (due.length) {
    return { ruleId: rule.id, kind: 'due', date: due[due.length - 1], count: due.length };
  }
  const tomorrow = format(addDays(parseISO(today), 1), 'yyyy-MM-dd');
  const [next] = pendingDates(rule, 1, tomorrow);
  return next === tomorrow ? { ruleId: rule.id, kind: 'upcoming', date: next, count: 1 } : null;
}

/** Names a reminder, so each is shown once: per rule, kind and occurrence date. */
export function billReminderKey(reminder: BillReminder): string {
  return `${reminder.ruleId}|${reminder.kind}|${reminder.date}`;
}
