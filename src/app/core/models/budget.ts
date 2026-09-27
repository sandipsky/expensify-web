import { TimestampLike } from './timestamp';

/** `budgets.period` values (§8). Lowercase strings shared with Android. */
export const BUDGET_PERIODS = ['monthly', 'weekly', 'yearly'] as const;

export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

/** `budgets.lastAlert` (§8): the highest threshold already alerted in the period that starts on `periodStart`. */
export interface BudgetAlert {
  /** `YYYY-MM-DD`, the first day of the period. */
  periodStart: string;
  /** Percent used, e.g. 80. */
  threshold: number;
}

/** `users/{uid}/budgets/{budgetId}` (§8). */
export interface Budget {
  id: string;
  /** Shown on the budget card. */
  name: string;
  /** Limit per period, minor units. */
  amount: number;
  /** Monthly periods follow the month start day, weekly ones the week start day (BUD-08). */
  period: BudgetPeriod;
  /** Expense categories; a parent brings its subcategories (BR-07). Empty means every expense. */
  categoryIds: string[];
  /** Carry the previous period's unspent or overspent amount into this one (BUD-07). */
  rollover: boolean;
  /** Percent-used levels that alert once per period (BUD-06); default [80, 100], empty for none. */
  alertThresholds: number[];
  lastAlert?: BudgetAlert | null;
  /** Paused budgets keep their settings but show no progress and send no alerts. */
  active: boolean;
  createdAt: TimestampLike | null;
  updatedAt: TimestampLike | null;
  /** Local only: the document has writes the server hasn't confirmed (SYN-04). */
  pending?: boolean;
}

/** What a new budget is written with; the repo adds the audit fields. */
export type NewBudget = Omit<Budget, 'id' | 'lastAlert' | 'createdAt' | 'updatedAt' | 'pending'>;

/** The user-editable fields of a budget, as the form produces them. */
export interface BudgetInput {
  name: string;
  amount: number;
  period: BudgetPeriod;
  categoryIds: string[];
  rollover: boolean;
  /** Alert at 80% and 100% (BUD-06). */
  alerts: boolean;
}
