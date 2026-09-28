import { AlertKind } from './alert-inbox';

/** The Material Symbols name each kind of alert shows. */
export const ALERT_ICONS: Readonly<Record<AlertKind, string>> = {
  budget: 'donut_large',
  bill: 'event_repeat',
  reminder: 'schedule',
};

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
];

/** "just now", "5 minutes ago", "yesterday", "3 days ago", in the user's locale. */
export function relativeTime(at: number, now: number, locale: string): string {
  const elapsed = Math.max(0, now - at);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, ms] of UNITS) {
    if (elapsed >= ms) return format.format(-Math.floor(elapsed / ms), unit);
  }
  return format.format(0, 'second');
}

/** The bell's name for screen readers: "Alerts" or "Alerts, 3 new". */
export function alertsLabel(unread: number): string {
  return unread ? `Alerts, ${unread} new` : 'Alerts';
}
