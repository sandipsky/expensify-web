import { BudgetState, MAX_BUDGET_NAME } from '../../core/domain/budget';
import { BudgetPeriod } from '../../core/models/budget';
import { IconName } from '../../shared/components/ui/icon/icon';
import { ChipVariant } from '../../shared/components/ui/chip';
import { ProgressVariant } from '../../shared/components/ui/progress';

export const BUDGET_PERIOD_LABELS: Readonly<Record<BudgetPeriod, string>> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

/** Items for the period `l-segmented-control`, shortest first (BUD-08). */
export const BUDGET_PERIOD_OPTIONS = (['weekly', 'monthly', 'yearly'] as const).map((value) => ({
  value,
  label: BUDGET_PERIOD_LABELS[value],
}));

/** "a week", for "Rs 500.00 a week". */
export const PER_PERIOD: Readonly<Record<BudgetPeriod, string>> = {
  weekly: 'a week',
  monthly: 'a month',
  yearly: 'a year',
};

/** How the previous period is named where it matters to rollover (BUD-07). */
export const PREVIOUS_PERIOD: Readonly<Record<BudgetPeriod, string>> = {
  weekly: 'last week',
  monthly: 'last period',
  yearly: 'last year',
};

/** How each state reads: a label and an icon alongside the color, never color alone (NFR-09). */
export interface StateView {
  label: string;
  icon: IconName;
  chip: ChipVariant;
  progress: ProgressVariant;
}

export const BUDGET_STATES: Readonly<Record<BudgetState, StateView>> = {
  on_track: { label: 'On track', icon: 'check_circle', chip: 'success', progress: 'success' },
  warning: { label: 'Warning', icon: 'warning', chip: 'warn', progress: 'warn' },
  over: { label: 'Over', icon: 'error', chip: 'error', progress: 'error' },
};

/** "5 days left", "Last day". */
export function daysLeftLabel(days: number): string {
  if (days <= 0) return 'Ended';
  return days === 1 ? 'Last day' : `${days} days left`;
}

/** "86%", or "—" for a zero limit (like a savings rate without income, BR-04). */
export function percentLabel(percent: number | null): string {
  return percent === null ? '—' : `${percent}%`;
}

/**
 * A name for a new budget from its categories, until the user types one:
 * "All expenses", "Food and dining", "Food and dining & Transport",
 * "Food and dining & 2 more".
 */
export function suggestBudgetName(names: readonly string[]): string {
  const [first, second] = names;
  const name = !first
    ? 'All expenses'
    : names.length === 1
      ? first
      : names.length === 2
        ? `${first} & ${second}`
        : `${first} & ${names.length - 1} more`;
  return name.slice(0, MAX_BUDGET_NAME);
}
