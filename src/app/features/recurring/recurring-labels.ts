import { parseISO } from 'date-fns';
import { dayOfMonthOf, weekdaysOf } from '../../core/domain/recurrence';
import { EndType, Frequency, RecurringRule, RuleMode, Schedule } from '../../core/models/recurring';

export const FREQUENCY_LABELS: Readonly<Record<Frequency, string>> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

/** Items for the frequency `l-segmented-control` (REC-02). */
export const FREQUENCY_OPTIONS = (['daily', 'weekly', 'monthly', 'yearly'] as const).map(
  (value) => ({ value, label: FREQUENCY_LABELS[value] }),
);

/** Items for how a rule ends (REC-03). */
export const END_OPTIONS: readonly { value: EndType; label: string }[] = [
  { value: 'never', label: 'Never' },
  { value: 'count', label: 'After' },
  { value: 'until', label: 'On date' },
];

/** Items for what happens on the due date (REC-04). */
export const MODE_OPTIONS: readonly { value: RuleMode; label: string }[] = [
  { value: 'auto', label: 'Add it automatically' },
  { value: 'confirm', label: 'Ask me first' },
];

const UNITS: Readonly<Record<Frequency, readonly [string, string]>> = {
  daily: ['day', 'days'],
  weekly: ['week', 'weeks'],
  monthly: ['month', 'months'],
  yearly: ['year', 'years'],
};

/** "day" or "days", for the "Every N …" field's suffix. */
export function intervalUnit(frequency: Frequency, interval: number | null): string {
  return UNITS[frequency][interval === 1 ? 0 : 1];
}

/** "1st", "22nd", "30th". */
export function ordinal(day: number): string {
  const teen = day % 100 >= 11 && day % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10];
  return `${day}${suffix ?? 'th'}`;
}

/** Items for the monthly day picker: the 1st to the 30th, then "Last day" (31, BR-09). */
export const DAY_OF_MONTH_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  value: i + 1,
  label: i === 30 ? 'Last day' : ordinal(i + 1),
}));

/** Weekday names in the locale, ISO order: index 0 is Monday (§8 `weekdays`). */
export function weekdayNames(locale: string, style: 'short' | 'long' = 'short'): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: style });
  // 1 January 2024 was a Monday.
  return Array.from({ length: 7 }, (_, i) => formatter.format(new Date(2024, 0, 1 + i)));
}

/** Weekday items for the weekly picker, starting on the user's first day of the week (SET-05). */
export function weekdayOptions(locale: string, weekStartDay: number) {
  const names = weekdayNames(locale, 'long');
  return Array.from({ length: 7 }, (_, i) => {
    const value = ((weekStartDay - 1 + i) % 7) + 1;
    return { value, label: names[value - 1] };
  });
}

/** "Mon", "Mon and Thu", "Mon, Wed and Fri". */
function list(items: readonly string[]): string {
  return items.length < 2
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The schedule in words (REC-02): "Every day", "Every 2 weeks on Mon and Thu",
 * "Every month on the 1st", "Every month on the last day", "Every year on 25 Dec".
 */
export function scheduleLabel(schedule: Schedule, locale: string): string {
  const n = Math.max(1, schedule.interval || 1);
  const every =
    n === 1
      ? `Every ${UNITS[schedule.frequency][0]}`
      : `Every ${n} ${UNITS[schedule.frequency][1]}`;
  switch (schedule.frequency) {
    case 'daily':
      return every;
    case 'weekly': {
      const names = weekdayNames(locale);
      return `${every} on ${list(weekdaysOf(schedule).map((day) => names[day - 1]))}`;
    }
    case 'yearly': {
      const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
      return `${every} on ${day.format(parseISO(schedule.startDate))}`;
    }
    default: {
      const day = dayOfMonthOf(schedule);
      return `${every} on the ${day === 31 ? 'last day' : ordinal(day)}`;
    }
  }
}

/** "1 entry", "12 entries". */
export function entryCount(count: number): string {
  return `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

/** How the rule ends (REC-03), or '' for one that never does. */
export function endLabel(
  rule: Pick<RecurringRule, 'endType' | 'endDate' | 'maxCount' | 'occurrences'>,
  formatDate: (date: string) => string,
): string {
  if (rule.endType === 'count' && rule.maxCount !== null) {
    const left = Math.max(0, rule.maxCount - rule.occurrences);
    return `Ends after ${entryCount(rule.maxCount)} (${left} left)`;
  }
  if (rule.endType === 'until' && rule.endDate) return `Ends on ${formatDate(rule.endDate)}`;
  return '';
}
