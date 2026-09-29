// Which currency a new profile starts with, from the browser's locale (ONB-01).
// Pure: no Angular or Firebase imports.

const EURO_REGIONS = [
  'AT',
  'BE',
  'CY',
  'DE',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PT',
  'SI',
  'SK',
];

/** ISO 3166 region → ISO 4217 currency, for the regions people most often browse from. */
const CURRENCY_BY_REGION: Readonly<Record<string, string>> = {
  ...Object.fromEntries(EURO_REGIONS.map((region) => [region, 'EUR'])),
  AE: 'AED',
  AR: 'ARS',
  AU: 'AUD',
  BD: 'BDT',
  BG: 'BGN',
  BH: 'BHD',
  BR: 'BRL',
  BT: 'BTN',
  CA: 'CAD',
  CH: 'CHF',
  CL: 'CLP',
  CN: 'CNY',
  CO: 'COP',
  CZ: 'CZK',
  DK: 'DKK',
  EG: 'EGP',
  ET: 'ETB',
  GB: 'GBP',
  GH: 'GHS',
  HK: 'HKD',
  HU: 'HUF',
  ID: 'IDR',
  IL: 'ILS',
  IN: 'INR',
  IS: 'ISK',
  JO: 'JOD',
  JP: 'JPY',
  KE: 'KES',
  KR: 'KRW',
  KW: 'KWD',
  LK: 'LKR',
  MA: 'MAD',
  MM: 'MMK',
  MX: 'MXN',
  MY: 'MYR',
  NG: 'NGN',
  NO: 'NOK',
  NP: 'NPR',
  NZ: 'NZD',
  OM: 'OMR',
  PH: 'PHP',
  PK: 'PKR',
  PL: 'PLN',
  QA: 'QAR',
  RO: 'RON',
  RS: 'RSD',
  RU: 'RUB',
  SA: 'SAR',
  SE: 'SEK',
  SG: 'SGD',
  TH: 'THB',
  TR: 'TRY',
  TW: 'TWD',
  TZ: 'TZS',
  UA: 'UAH',
  UG: 'UGX',
  US: 'USD',
  VN: 'VND',
  ZA: 'ZAR',
};

/**
 * The currency of the locale's region ("en-GB" → GBP, "ne-NP" → NPR), or of
 * the region the language most likely means ("ja" → JPY), or `fallback` when
 * the browser can't tell. Only a preselection: onboarding asks.
 */
export function guessCurrency(locale: string, fallback: string): string {
  try {
    const region = new Intl.Locale(locale).maximize().region;
    return (region && CURRENCY_BY_REGION[region]) || fallback;
  } catch {
    return fallback;
  }
}
