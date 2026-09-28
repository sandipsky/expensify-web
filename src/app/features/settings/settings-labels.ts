import { currencyCodes } from '../../core/domain/money';
import { Theme } from '../../core/models/user';
import { ordinal, weekdayNames } from '../recurring/recurring-labels';

export interface Option<T> {
  value: T;
  label: string;
}

/** Locales offered for numbers, amounts and dates (SET-01), besides the device's own. */
const LOCALES = [
  'en-US',
  'en-GB',
  'en-IN',
  'en-AU',
  'en-CA',
  'ne-NP',
  'hi-IN',
  'de-DE',
  'es-ES',
  'fr-FR',
  'it-IT',
  'nl-NL',
  'pt-BR',
  'ja-JP',
  'ko-KR',
  'zh-CN',
];

/** Every currency the browser formats, "USD · US Dollar", A to Z by code (SET-01). */
export function currencyOptions(locale: string): Option<string>[] {
  const names = displayNames(locale, 'currency');
  return currencyCodes().map((code) => {
    const name = names?.of(code);
    return { value: code, label: name && name !== code ? `${code} · ${name}` : code };
  });
}

/** The currency's name, "US Dollar", or its code where the browser has no name. */
export function currencyName(code: string, locale: string): string {
  return displayNames(locale, 'currency')?.of(code) ?? code;
}

/**
 * Locales for numbers and dates, each named in its own language
 * ("English (United Kingdom)", "Deutsch (Deutschland)"), with `current` and
 * the device's locale included even when they aren't in the list.
 */
export function localeOptions(current: string, device: string): Option<string>[] {
  const tags = [...new Set([current, device, ...LOCALES])];
  return tags
    .map((tag) => ({ value: tag, label: displayNames(tag, 'language')?.of(tag) ?? tag }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** "1,234,567.89 · 28 Sep 2026": how the locale writes an amount and a date. */
export function formatSample(
  locale: string,
  formatAmount: (minor: number) => string,
  date: Date,
): string {
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
  return `${formatAmount(123_456_789)} · ${day}`;
}

/** The month start day picker: the 1st to the 28th (SET-02, BR-05). */
export const MONTH_START_OPTIONS: readonly Option<number>[] = Array.from(
  { length: 28 },
  (_, i) => ({
    value: i + 1,
    label: ordinal(i + 1),
  }),
);

/** The week start picker, Monday first, as ISO weekdays (SET-05). */
export function weekStartOptions(locale: string): Option<number>[] {
  return weekdayNames(locale, 'long').map((label, i) => ({ value: i + 1, label }));
}

export const THEME_OPTIONS: readonly Option<Theme>[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

function displayNames(locale: string, type: 'currency' | 'language'): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames([locale], { type });
  } catch {
    return null;
  }
}
