/** The reports the page offers (§3.10). */
export const REPORT_VIEWS = [
  'categories',
  'trend',
  'compare',
  'year',
  'accounts',
  'payees',
] as const;

export type ReportView = (typeof REPORT_VIEWS)[number];

export const REPORT_VIEW_LABELS: Readonly<Record<ReportView, string>> = {
  categories: 'Categories',
  trend: 'Trend',
  compare: 'Compare',
  year: 'Year',
  accounts: 'Cash flow',
  payees: 'Payees',
};

/** Items for the report switcher. */
export const REPORT_VIEW_OPTIONS = REPORT_VIEWS.map((value) => ({
  value,
  label: REPORT_VIEW_LABELS[value],
}));

/** Items for the Expense/Income switch. */
export const CATEGORY_TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
] as const;

/** "34%", or "—" when there's nothing to share or no income (BR-04). */
export function percentText(percent: number | null): string {
  return percent === null ? '—' : `${percent}%`;
}

/**
 * "+12%", "-5%", "0%" in the locale's own signs, so they match the amounts beside
 * them, or "New" when there was nothing before (RPT-03).
 */
export function changeText(percent: number | null, locale: string): string {
  if (percent === null) return 'New';
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    signDisplay: 'exceptZero',
    maximumFractionDigits: 0,
  }).format(percent / 100);
}

/** "1 entry", "12 entries". */
export function entries(count: number): string {
  return `${count} ${count === 1 ? 'entry' : 'entries'}`;
}
