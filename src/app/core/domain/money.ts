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
