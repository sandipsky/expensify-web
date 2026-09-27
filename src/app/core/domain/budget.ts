// Budget rules (§3.8, BR-07, BR-08): pure functions on integer minor units and
// `YYYY-MM-DD` strings, mirrored in Kotlin. The budgets screens, alerts and later
// the dashboard all get their figures from here.
import { format } from 'date-fns';
import { Budget, BudgetPeriod } from '../models/budget';
import { Category } from '../models/category';
import { Transaction } from '../models/transaction';
import { rollUpId } from './category';
import { DateRange, budgetYearPeriod, daysIn, inRange, monthPeriod, weekPeriod } from './period';
import { isAdjustment } from './transactions';

/** Longest budget name the form accepts. */
export const MAX_BUDGET_NAME = 40;

/** Percent used from which a budget is in the warning state (BR-08). */
export const WARNING_PERCENT = 80;
/** Percent used from which a budget is over (BR-08). */
export const OVER_PERCENT = 100;

/** `alertThresholds` for a new budget with alerts on (§8, BUD-06). */
export const DEFAULT_ALERT_THRESHOLDS: readonly number[] = [WARNING_PERCENT, OVER_PERCENT];

/** How many past periods a budget's history shows (BUD-05): about two months of weeks, half a year of months. */
export const HISTORY_PERIODS: Readonly<Record<BudgetPeriod, number>> = {
  weekly: 8,
  monthly: 6,
  yearly: 2,
};

/** Budget state from % used (BR-08). Lowercase, like the §8 enum values. */
export type BudgetState = 'on_track' | 'warning' | 'over';

/** The profile settings periods depend on (§8 `monthStartDay`, `weekStartDay`). */
export interface PeriodSettings {
  /** 1–28 (BR-05). */
  monthStartDay: number;
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekStartDay: number;
}

/**
 * The budget's period that contains `today`, or the one `offset` periods away
 * (BUD-08): a month from the month start day (BR-05), a week from the week
 * start day, or a year of twelve such months.
 */
export function budgetPeriodRange(
  period: BudgetPeriod,
  today: string,
  settings: PeriodSettings,
  offset = 0,
): DateRange {
  switch (period) {
    case 'weekly':
      return weekPeriod(today, settings.weekStartDay, offset);
    case 'yearly':
      return budgetYearPeriod(today, settings.monthStartDay, offset);
    case 'monthly':
      return monthPeriod(today, settings.monthStartDay, offset);
  }
}

/**
 * Whether a transaction counts toward the budget (BUD-04, BR-07): expenses only,
 * so never transfers (TXN-09) or income, and never balance adjustments (BR-12).
 * A budget with categories counts those and their subcategories (CAT-07); one
 * without counts every expense.
 */
export function countsToward(
  budget: Pick<Budget, 'categoryIds'>,
  tx: Pick<Transaction, 'type' | 'categoryId'>,
  categories: ReadonlyMap<string, Pick<Category, 'parentId'>>,
): boolean {
  if (tx.type !== 'expense' || isAdjustment(tx)) return false;
  if (!budget.categoryIds.length) return true;
  const id = tx.categoryId;
  if (!id) return false;
  return budget.categoryIds.includes(id) || budget.categoryIds.includes(rollUpId(id, categories));
}

/** The budget's spending in the range, in minor units (BR-07). `txs` may cover more than the range. */
export function budgetSpent(
  budget: Pick<Budget, 'categoryIds'>,
  txs: readonly Pick<Transaction, 'type' | 'amount' | 'categoryId' | 'date'>[],
  range: DateRange,
  categories: ReadonlyMap<string, Pick<Category, 'parentId'>>,
): number {
  let spent = 0;
  for (const tx of txs) {
    if (inRange(tx.date, range) && countsToward(budget, tx, categories)) spent += tx.amount;
  }
  return spent;
}

/**
 * Whether `spent` has reached `percent` of `limit`, in integers so no float
 * rounding can move a budget across a threshold (BR-11). A zero limit has
 * reached every threshold: there's nothing left to spend.
 */
export function hasReached(spent: number, limit: number, percent: number): boolean {
  return spent * 100 >= percent * limit;
}

/** On track under 80% used, warning from 80%, over from 100% (BR-08). */
export function budgetState(spent: number, limit: number): BudgetState {
  if (hasReached(spent, limit, OVER_PERCENT)) return 'over';
  if (hasReached(spent, limit, WARNING_PERCENT)) return 'warning';
  return 'on_track';
}

/**
 * Whole percent used, for display (BR-11). Rounded down, so the figure never
 * contradicts the state: 79.6% reads 79%, on track. Null for a zero limit,
 * shown as "—" like a savings rate without income (BR-04).
 */
export function percentUsed(spent: number, limit: number): number | null {
  return limit > 0 ? Math.floor((spent * 100) / limit) : null;
}

/** Days left in the range from `today`, both included; all of it before it starts, 0 once it's over. */
export function daysLeft(range: DateRange, today: string): number {
  if (today > range.end) return 0;
  if (today < range.start) return daysIn(range);
  return daysIn({ start: today, end: range.end });
}

/**
 * Remaining ÷ days left (BUD-02), rounded down so spending it every day stays
 * within the limit. 0 when nothing is left.
 */
export function safePerDay(remaining: number, days: number): number {
  return remaining > 0 && days > 0 ? Math.floor(remaining / days) : 0;
}

/** The local date the budget was created, or null while the server hasn't confirmed it. */
export function createdDate(budget: Pick<Budget, 'createdAt'>): string | null {
  const ms = budget.createdAt?.toMillis();
  return ms === undefined ? null : format(new Date(ms), 'yyyy-MM-dd');
}

/**
 * What rolls into a period from the one before it (BUD-07): the plain `amount`
 * minus what that period spent, so unspent money adds to the limit and
 * overspending takes from it. It reaches back one period only, and nothing
 * rolls in from a period that ended before the budget was created.
 */
export function carryOver(
  budget: Pick<Budget, 'amount' | 'rollover' | 'createdAt'>,
  previous: { range: DateRange; spent: number },
): number {
  if (!budget.rollover) return 0;
  const created = createdDate(budget);
  if (!created || created > previous.range.end) return 0;
  return budget.amount - previous.spent;
}

/** A budget's figures for one period (BUD-02, BUD-03). Amounts in minor units. */
export interface BudgetResult {
  range: DateRange;
  spent: number;
  /** `amount` plus what rolled in, never below 0. */
  limit: number;
  /** What rolled in from the previous period (BUD-07): negative after overspending, 0 without rollover. */
  carry: number;
  /** Limit − spent; negative when over. */
  remaining: number;
  /** Whole percent used, rounded down; null for a zero limit. */
  percent: number | null;
  state: BudgetState;
}

/** The current period's figures, with what's left to spend each day (BUD-02). */
export interface BudgetProgress extends BudgetResult {
  daysLeft: number;
  safePerDay: number;
}

/** A past period's figures (BUD-05). */
export interface BudgetHistoryEntry extends BudgetResult {
  /** The period ended before the budget was created: shown for comparison only. */
  beforeBudget: boolean;
}

type BudgetRules = Pick<Budget, 'amount' | 'period' | 'categoryIds' | 'rollover' | 'createdAt'>;
type SpendingTx = Pick<Transaction, 'type' | 'amount' | 'categoryId' | 'date'>;

/**
 * The budget's figures for the period `offset` periods from the current one.
 * `txs` must cover that period and, with rollover, the one before it
 * (`neededRange`).
 */
export function budgetResult(
  budget: BudgetRules,
  txs: readonly SpendingTx[],
  today: string,
  settings: PeriodSettings,
  categories: ReadonlyMap<string, Pick<Category, 'parentId'>>,
  offset = 0,
): BudgetResult {
  const range = budgetPeriodRange(budget.period, today, settings, offset);
  const spent = budgetSpent(budget, txs, range, categories);
  let carry = 0;
  if (budget.rollover) {
    const previous = budgetPeriodRange(budget.period, today, settings, offset - 1);
    carry = carryOver(budget, {
      range: previous,
      spent: budgetSpent(budget, txs, previous, categories),
    });
  }
  const limit = Math.max(0, budget.amount + carry);
  return {
    range,
    spent,
    limit,
    carry,
    remaining: limit - spent,
    percent: percentUsed(spent, limit),
    state: budgetState(spent, limit),
  };
}

/** The current period's figures and safe-to-spend per day (BUD-02, BUD-03). */
export function budgetProgress(
  budget: BudgetRules,
  txs: readonly SpendingTx[],
  today: string,
  settings: PeriodSettings,
  categories: ReadonlyMap<string, Pick<Category, 'parentId'>>,
): BudgetProgress {
  const result = budgetResult(budget, txs, today, settings, categories);
  const days = daysLeft(result.range, today);
  return { ...result, daysLeft: days, safePerDay: safePerDay(result.remaining, days) };
}

/**
 * The `count` periods before the current one, newest first (BUD-05). `txs`
 * must cover `neededRange(budget, …, count)`. Periods that ended before the
 * budget was created are marked, since it didn't apply then.
 */
export function budgetHistory(
  budget: BudgetRules,
  txs: readonly SpendingTx[],
  today: string,
  settings: PeriodSettings,
  categories: ReadonlyMap<string, Pick<Category, 'parentId'>>,
  count: number,
): BudgetHistoryEntry[] {
  const created = createdDate(budget);
  const entries: BudgetHistoryEntry[] = [];
  for (let offset = -1; offset >= -count; offset--) {
    const result = budgetResult(budget, txs, today, settings, categories, offset);
    entries.push({ ...result, beforeBudget: !created || result.range.end < created });
  }
  return entries;
}

/**
 * The dates the budget's figures read: the current period back `periodsBack`
 * more periods, plus the one before those when it rolls over (BUD-07).
 */
export function neededRange(
  budget: Pick<Budget, 'period' | 'rollover'>,
  today: string,
  settings: PeriodSettings,
  periodsBack = 0,
): DateRange {
  const back = periodsBack + (budget.rollover ? 1 : 0);
  return {
    start: budgetPeriodRange(budget.period, today, settings, -back).start,
    end: budgetPeriodRange(budget.period, today, settings).end,
  };
}

/**
 * The highest alert threshold the period has newly reached (BUD-06), or null.
 * `lastAlert` holds the highest one already sent for a period, so each
 * threshold alerts once per period and a jump past both sends only the higher.
 * Paused budgets never alert.
 */
export function alertDue(
  budget: Pick<Budget, 'active' | 'alertThresholds' | 'lastAlert'>,
  result: Pick<BudgetResult, 'range' | 'spent' | 'limit'>,
): number | null {
  if (!budget.active) return null;
  const last = budget.lastAlert;
  const sent = last && last.periodStart === result.range.start ? last.threshold : 0;
  let due: number | null = null;
  for (const threshold of budget.alertThresholds) {
    if (threshold > sent && hasReached(result.spent, result.limit, threshold)) {
      due = Math.max(due ?? threshold, threshold);
    }
  }
  return due;
}

/** Budgets for every expense first, then by name. */
export function compareBudgets(
  a: Pick<Budget, 'name' | 'categoryIds'>,
  b: Pick<Budget, 'name' | 'categoryIds'>,
): number {
  const allA = a.categoryIds.length ? 1 : 0;
  const allB = b.categoryIds.length ? 1 : 0;
  return allA - allB || a.name.localeCompare(b.name);
}
