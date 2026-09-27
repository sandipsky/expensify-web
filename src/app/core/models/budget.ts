import { TimestampLike } from './timestamp';

/**
 * `users/{uid}/budgets/{budgetId}` (§8). Only the categories feature reads budgets
 * so far, to move them off a deleted category (CAT-06); the budgets feature (M2)
 * builds on this.
 */
export interface Budget {
  id: string;
  name: string;
  /** Limit per period, minor units. */
  amount: number;
  /** `monthly`; weekly and yearly come later. */
  period: 'monthly';
  /** Empty means every expense. */
  categoryIds: string[];
  rollover: boolean;
  alertThresholds: number[];
  lastAlert?: { periodStart: string; threshold: number } | null;
  active: boolean;
  createdAt: TimestampLike | null;
  updatedAt: TimestampLike | null;
}
