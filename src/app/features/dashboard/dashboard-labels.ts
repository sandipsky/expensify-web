/** The cards the dashboard can show (§3.7), in their default order on a phone. */
export const DASHBOARD_CARDS = [
  'summary',
  'balances',
  'spending',
  'budgets',
  'trend',
  'recent',
  'upcoming',
  'largest',
] as const;

export type DashboardCard = (typeof DASHBOARD_CARDS)[number];

export const CARD_LABELS: Readonly<Record<DashboardCard, string>> = {
  summary: 'Summary',
  balances: 'Balances',
  spending: 'Spending by category',
  budgets: 'Budgets',
  trend: 'Income vs expense',
  recent: 'Recent transactions',
  upcoming: 'Upcoming',
  largest: 'Largest expenses',
};

/** Cards hidden until the user turns them on: the largest expenses (DSH-15) aren't on the default page. */
export const HIDDEN_BY_DEFAULT: readonly DashboardCard[] = ['largest'];

/** Cards that show the selected period; a period without entries replaces them with one empty state (DSH-13). */
export const PERIOD_CARDS: readonly DashboardCard[] = [
  'summary',
  'spending',
  'trend',
  'recent',
  'largest',
];

/** The periods the switcher offers (DSH-06). */
export const DASHBOARD_PRESETS = ['this_month', 'last_month', 'custom'] as const;

export type DashboardPreset = (typeof DASHBOARD_PRESETS)[number];

export const DASHBOARD_PRESET_LABELS: Readonly<Record<DashboardPreset, string>> = {
  this_month: 'This month',
  last_month: 'Last month',
  custom: 'Custom',
};

/** Items for the period switcher. */
export const DASHBOARD_PRESET_OPTIONS = DASHBOARD_PRESETS.map((value) => ({
  value,
  label: DASHBOARD_PRESET_LABELS[value],
}));

/**
 * "+5 pts", "-3 pts", "0 pts": how a savings rate moved, in percentage points
 * with the locale's signs (DSH-10).
 */
export function pointsText(points: number, locale: string): string {
  const text = new Intl.NumberFormat(locale, { signDisplay: 'exceptZero' }).format(points);
  return `${text} pts`;
}

/** "1 category", "3 categories". */
export function categoryCount(count: number): string {
  return `${count} ${count === 1 ? 'category' : 'categories'}`;
}
