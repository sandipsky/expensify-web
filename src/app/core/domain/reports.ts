// Reports (§3.10): pure functions on integer minor units and `YYYY-MM-DD` strings,
// mirrored in Kotlin. Every total leaves out transfers (TXN-09) and balance
// adjustments (BR-12) unless it's about moving money between accounts (RPT-06),
// and categories roll up to their parent (CAT-07). Percentages are rounded only
// here, for display (BR-11): `Math.round`, which rounds halves up like Kotlin's
// `roundToInt()`.
import { Category, CategoryType } from '../models/category';
import { Transaction } from '../models/transaction';
import { rollUpId } from './category';
import { DateRange, budgetYearPeriod, inRange, monthPeriod } from './period';
import { isAdjustment, totalsOf } from './transactions';

type ReportTx = Pick<Transaction, 'type' | 'amount' | 'categoryId' | 'date'>;
type ParentMap = ReadonlyMap<string, Pick<Category, 'parentId'>>;

/** Whole percent of `total`, or null when there's no total to share. */
export function shareOf(amount: number, total: number): number | null {
  return total > 0 ? Math.round((amount * 100) / total) : null;
}

/** Savings rate: net ÷ income × 100, whole percent; null ("—") when there's no income (BR-04). */
export function savingsRate(income: number, net: number): number | null {
  return income > 0 ? Math.round((net * 100) / income) : null;
}

/** Change from `previous` to `current` as whole percent; null when there was nothing before. */
export function changePercent(previous: number, current: number): number | null {
  return previous !== 0 ? Math.round(((current - previous) * 100) / Math.abs(previous)) : null;
}

/** How a figure moved from the previous period (DSH-10): the difference and, when there was something before, the whole percent. */
export interface Change {
  amount: number;
  percent: number | null;
}

export function changeOf(previous: number, current: number): Change {
  return { amount: current - previous, percent: changePercent(previous, current) };
}

/** Each summary figure's change from `previous` to `current` (DSH-10). */
export interface SummaryChange {
  income: Change;
  expense: Change;
  net: Change;
  /** In percentage points; null when either period has no income (BR-04). */
  savingsRate: number | null;
}

export function summaryChange(
  previous: Pick<PeriodSummary, 'income' | 'expense' | 'net' | 'savingsRate'>,
  current: Pick<PeriodSummary, 'income' | 'expense' | 'net' | 'savingsRate'>,
): SummaryChange {
  return {
    income: changeOf(previous.income, current.income),
    expense: changeOf(previous.expense, current.expense),
    net: changeOf(previous.net, current.net),
    savingsRate:
      previous.savingsRate === null || current.savingsRate === null
        ? null
        : current.savingsRate - previous.savingsRate,
  };
}

/** One top-level category's part of a period's income or expense (RPT-01). */
export interface CategoryTotal {
  /** The top-level category, with its subcategories rolled in (CAT-07). */
  categoryId: string;
  amount: number;
  count: number;
}

/**
 * The type's totals per top-level category, largest first (RPT-01). Entries
 * without a category count under "" so the total still adds up; ties sort by
 * ID so both apps list them alike.
 */
export function categoryTotals(
  txs: readonly ReportTx[],
  type: CategoryType,
  categories: ParentMap,
): CategoryTotal[] {
  const totals = new Map<string, CategoryTotal>();
  for (const tx of txs) {
    if (tx.type !== type || isAdjustment(tx)) continue;
    const id = tx.categoryId ? rollUpId(tx.categoryId, categories) : '';
    const total = totals.get(id) ?? { categoryId: id, amount: 0, count: 0 };
    total.amount += tx.amount;
    total.count += 1;
    totals.set(id, total);
  }
  return [...totals.values()].sort(
    (a, b) => b.amount - a.amount || (a.categoryId < b.categoryId ? -1 : 1),
  );
}

/** The first `keep` rows, and what the rest add up to ("Other"), or null when nothing's left over. */
export function topAndOther(
  rows: readonly CategoryTotal[],
  keep: number,
): {
  top: CategoryTotal[];
  other: { amount: number; count: number; categoryIds: string[] } | null;
} {
  const top = rows.slice(0, keep);
  const rest = rows.slice(keep);
  if (!rest.length) return { top, other: null };
  return {
    top,
    other: {
      amount: rest.reduce((sum, r) => sum + r.amount, 0),
      count: rest.reduce((sum, r) => sum + r.count, 0),
      categoryIds: rest.map((r) => r.categoryId),
    },
  };
}

/** Income, expense, net and savings rate for one period (RPT-02, RPT-05). */
export interface PeriodSummary {
  range: DateRange;
  income: number;
  expense: number;
  net: number;
  savingsRate: number | null;
}

/** Each range's summary, in the order given. `txs` must cover them all and may cover more. */
export function periodSummaries(
  txs: readonly ReportTx[],
  ranges: readonly DateRange[],
): PeriodSummary[] {
  return ranges.map((range) =>
    summaryOf(
      range,
      txs.filter((tx) => inRange(tx.date, range)),
    ),
  );
}

/** One summary of everything in `txs`, labelled with `range`. */
export function summaryOf(range: DateRange, txs: readonly ReportTx[]): PeriodSummary {
  const { income, expense, net } = totalsOf(txs);
  return { range, income, expense, net, savingsRate: savingsRate(income, net) };
}

/** The `count` month periods up to and including the current one, oldest first (RPT-02, BR-05). */
export function recentMonths(today: string, startDay: number, count: number): DateRange[] {
  return Array.from({ length: count }, (_, i) => monthPeriod(today, startDay, i - count + 1));
}

/**
 * The twelve month periods of the year `offset` years from the current one
 * (RPT-05): with start day 1 the calendar months, otherwise the twelve
 * periods from the one that contains 1 January (the budget year, BUD-08).
 */
export function yearMonths(today: string, startDay: number, offset = 0): DateRange[] {
  const year = budgetYearPeriod(today, startDay, offset);
  return Array.from({ length: 12 }, (_, i) => monthPeriod(year.start, startDay, i));
}

/** One category's figures in two periods (RPT-03). */
export interface CategoryChange {
  categoryId: string;
  previous: number;
  current: number;
  /** Current − previous, in minor units. */
  change: number;
  /** Whole percent; null when the category had nothing before. */
  percent: number | null;
}

/**
 * The type's top-level categories in either period, with the change between
 * them (RPT-03): largest current amount first, then largest previous.
 */
export function categoryChanges(
  previousTxs: readonly ReportTx[],
  currentTxs: readonly ReportTx[],
  type: CategoryType,
  categories: ParentMap,
): CategoryChange[] {
  const before = new Map(
    categoryTotals(previousTxs, type, categories).map((t) => [t.categoryId, t.amount]),
  );
  const now = new Map(
    categoryTotals(currentTxs, type, categories).map((t) => [t.categoryId, t.amount]),
  );
  const ids = new Set([...now.keys(), ...before.keys()]);
  return [...ids]
    .map((categoryId) => {
      const previous = before.get(categoryId) ?? 0;
      const current = now.get(categoryId) ?? 0;
      return {
        categoryId,
        previous,
        current,
        change: current - previous,
        percent: changePercent(previous, current),
      };
    })
    .sort(
      (a, b) =>
        b.current - a.current || b.previous - a.previous || (a.categoryId < b.categoryId ? -1 : 1),
    );
}

/** Money into and out of one account in a period (RPT-06). */
export interface AccountFlow {
  accountId: string;
  income: number;
  expense: number;
  transfersIn: number;
  transfersOut: number;
  /** Income + transfers in. */
  moneyIn: number;
  /** Expense + transfers out. */
  moneyOut: number;
  /** In − out: how much the period moved the balance, leaving out balance adjustments. */
  net: number;
}

/**
 * Cash flow per account (RPT-06). Unlike the other reports it counts
 * transfers, since they do move money in and out of each account, but keeps
 * them apart from income and expense. Balance adjustments are corrections,
 * not money moving, so they stay out (BR-12). Largest flow first.
 */
export function accountFlows(
  txs: readonly Pick<Transaction, 'type' | 'amount' | 'categoryId' | 'accountId' | 'toAccountId'>[],
): AccountFlow[] {
  const flows = new Map<string, AccountFlow>();
  const flowOf = (accountId: string) => {
    let flow = flows.get(accountId);
    if (!flow) {
      flow = {
        accountId,
        income: 0,
        expense: 0,
        transfersIn: 0,
        transfersOut: 0,
        moneyIn: 0,
        moneyOut: 0,
        net: 0,
      };
      flows.set(accountId, flow);
    }
    return flow;
  };
  for (const tx of txs) {
    if (isAdjustment(tx)) continue;
    if (tx.type === 'income') flowOf(tx.accountId).income += tx.amount;
    else if (tx.type === 'expense') flowOf(tx.accountId).expense += tx.amount;
    else if (tx.toAccountId) {
      flowOf(tx.accountId).transfersOut += tx.amount;
      flowOf(tx.toAccountId).transfersIn += tx.amount;
    }
  }
  for (const flow of flows.values()) {
    flow.moneyIn = flow.income + flow.transfersIn;
    flow.moneyOut = flow.expense + flow.transfersOut;
    flow.net = flow.moneyIn - flow.moneyOut;
  }
  return [...flows.values()].sort(
    (a, b) =>
      b.moneyIn + b.moneyOut - (a.moneyIn + a.moneyOut) || (a.accountId < b.accountId ? -1 : 1),
  );
}

/** What was spent with one payee (RPT-07). */
export interface PayeeTotal {
  /** As the newest entry spells it. */
  payee: string;
  amount: number;
  count: number;
}

/**
 * Expenses by payee, ignoring case and surrounding spaces, largest first
 * (RPT-07). Entries without a payee and balance adjustments are left out.
 * `txs` newest first, so each payee is spelled as last written.
 */
export function topPayees(
  txs: readonly Pick<Transaction, 'type' | 'amount' | 'categoryId' | 'payee'>[],
  limit: number,
): PayeeTotal[] {
  const totals = new Map<string, PayeeTotal>();
  for (const tx of txs) {
    const payee = tx.payee?.trim();
    if (tx.type !== 'expense' || !payee || isAdjustment(tx)) continue;
    const key = payee.toLowerCase();
    const total = totals.get(key) ?? { payee, amount: 0, count: 0 };
    total.amount += tx.amount;
    total.count += 1;
    totals.set(key, total);
  }
  return [...totals.values()]
    .sort((a, b) => b.amount - a.amount || b.count - a.count || a.payee.localeCompare(b.payee))
    .slice(0, limit);
}

/** The period's largest expenses, largest first; on a tie, in the order given (RPT-07). */
export function largestExpenses<T extends Pick<Transaction, 'type' | 'amount' | 'categoryId'>>(
  txs: readonly T[],
  limit: number,
): T[] {
  return txs
    .filter((tx) => tx.type === 'expense' && !isAdjustment(tx))
    .map((tx, i) => ({ tx, i }))
    .sort((a, b) => b.tx.amount - a.tx.amount || a.i - b.i)
    .slice(0, limit)
    .map(({ tx }) => tx);
}
