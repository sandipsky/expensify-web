/** Largest amount one transaction may carry, in minor units (BR-03). */
export const MAX_AMOUNT = 99_999_999_999;

const digitsByCurrency = new Map<string, number>();
const formatters = new Map<string, Intl.NumberFormat>();

/** ISO 4217 decimal places, read from Intl: JPY 0, USD 2, KWD 3 (BR-01). */
export function fractionDigits(currency: string): number {
  let digits = digitsByCurrency.get(currency);
  if (digits === undefined) {
    digits =
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    digitsByCurrency.set(currency, digits);
  }
  return digits;
}

function formatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let result = formatters.get(key);
  if (!result) {
    result = new Intl.NumberFormat(locale, options);
    formatters.set(key, result);
  }
  return result;
}

/**
 * A form value in major units, as `l-number-input` holds it (12.5), to integer
 * minor units for storage (1250, BR-01). It goes through the decimal text from
 * `toFixed` instead of multiplying the float, so binary rounding errors can't
 * reach the stored amount. `toFixed` rounds to the currency's places, as
 * `l-number-input` already does on blur when given `decimalPlaces`.
 */
export function toMinorUnits(major: number, currency: string): number {
  const digits = fractionDigits(currency);
  const [whole, fraction = ''] = Math.abs(major).toFixed(digits).split('.');
  const minor = Number(whole) * 10 ** digits + Number(fraction || '0');
  // `|| 0` keeps -0 out: Firestore would store it as a double, which the rules reject.
  return major < 0 ? -minor || 0 : minor;
}

/**
 * Minor units as a plain decimal in major units: a dot, the currency's places,
 * no grouping (1250 → "12.50", JPY 500 → "500"), as CSV exports write amounts
 * (Appendix B). Built from the integer's digits, so no float is involved.
 */
export function toDecimalString(minor: number, currency: string): string {
  const digits = fractionDigits(currency);
  const sign = minor < 0 ? '-' : '';
  const text = String(Math.abs(minor)).padStart(digits + 1, '0');
  if (!digits) return sign + text;
  return `${sign}${text.slice(0, -digits)}.${text.slice(-digits)}`;
}

/** Unicode minus and the spaces locales group digits with. */
const MINUS = /[−‒–]/g;
const GROUPING = /[\s  '’]/g;

/**
 * Parses an amount in major units as people and banks write it ("1,234.50",
 * "Rs 12.5", "(40.00)", "12,5" with a comma decimal) to integer minor units,
 * by splitting on the decimal separator, never multiplying floats (BR-01).
 * Parentheses, a leading or trailing minus make it negative. Returns null
 * when it isn't an amount, or has more places than the currency (trailing
 * zeros aside).
 */
export function parseDecimal(
  text: string,
  currency: string,
  decimalSeparator: '.' | ',' = '.',
): number | null {
  let s = text.trim().replace(MINUS, '-');
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  // A currency code or symbol before or after the number, with its sign.
  s = s.replace(/^[^\d.,+-]+/, '').replace(/[^\d.,+-]+$/, '');
  if (s.startsWith('-') || s.endsWith('-')) negative = !negative;
  s = s.replace(/^[+-]|[+-]$/g, '').replace(/^[^\d.,]+/, '');
  const grouping = decimalSeparator === '.' ? ',' : '.';
  s = s.replace(GROUPING, '').split(grouping).join('');
  if (decimalSeparator === ',') s = s.replace(',', '.');
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;

  const digits = fractionDigits(currency);
  const [whole, fraction = ''] = s.split('.');
  const extra = fraction.slice(digits);
  if (/[^0]/.test(extra)) return null;
  const minor =
    Number(whole || '0') * 10 ** digits +
    Number(fraction.slice(0, digits).padEnd(digits, '0') || '0');
  if (!Number.isSafeInteger(minor)) return null;
  return negative ? -minor || 0 : minor;
}

/** Minor units as the major-unit number `l-number-input` edits (1250 → 12.5). */
export function toMajorUnits(minor: number, currency: string): number {
  return minor / 10 ** fractionDigits(currency);
}

/** The currency's short symbol in the locale ("$", "€", "Rs"), for an input prefix. */
export function currencySymbol(currency: string, locale: string): string {
  const parts = formatter(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).formatToParts(0);
  return parts.find((p) => p.type === 'currency')?.value ?? currency;
}

/**
 * Minor units as short currency for chart axes and captions ("Rs 12K", "$1.2M"),
 * in the locale's compact notation, at most one decimal (BR-11: display only).
 */
export function formatCompactMoney(
  minor: number,
  currency: string,
  locale: string,
  signDisplay: 'auto' | 'exceptZero' = 'auto',
): string {
  return formatter(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    notation: 'compact',
    maximumFractionDigits: 1,
    signDisplay,
  }).format(minor / 10 ** fractionDigits(currency));
}

/**
 * Formats minor units as currency for the user's locale. Division happens only
 * here, for display (BR-11). `signDisplay: 'exceptZero'` gives the +/− that
 * income and expense need alongside color (NFR-09). Uses the short symbol, so
 * rupees read "Rs 1,234.50" rather than "NPR 1,234.50".
 */
export function formatMoney(
  minor: number,
  currency: string,
  locale: string,
  signDisplay: 'auto' | 'always' | 'exceptZero' | 'never' = 'auto',
): string {
  const digits = fractionDigits(currency);
  return formatter(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    signDisplay,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 10 ** digits);
}
