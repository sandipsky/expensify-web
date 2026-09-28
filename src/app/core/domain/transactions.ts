// Transaction rules (§3.5, §3.6): pure functions shared by the transaction form and
// list now, and the dashboard, budgets and reports later.
import { format } from 'date-fns';
import { ADJUSTMENT_CATEGORY_IDS, Category, CategoryType } from '../models/category';
import { NewTransaction, Transaction, TxType } from '../models/transaction';
import { sameAttachments } from './attachments';
import { rollUpId } from './category';

/** Longest payee (TXN-03). */
export const MAX_PAYEE_LENGTH = 100;
/** Longest note (TXN-03). */
export const MAX_NOTE_LENGTH = 500;
/** Most tags on one transaction (TXN-03). */
export const MAX_TAGS = 10;

/**
 * Newest first: by date, then time, then creation (§10). Entries without a time
 * sort below timed ones on the same day, and unconfirmed entries (no server
 * `createdAt` yet) count as the newest.
 */
export function compareNewestFirst(
  a: Pick<Transaction, 'date' | 'time' | 'createdAt'>,
  b: Pick<Transaction, 'date' | 'time' | 'createdAt'>,
): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  const timeA = a.time ?? '';
  const timeB = b.time ?? '';
  if (timeA !== timeB) return timeA < timeB ? 1 : -1;
  const createdA = a.createdAt?.toMillis() ?? Number.POSITIVE_INFINITY;
  const createdB = b.createdAt?.toMillis() ?? Number.POSITIVE_INFINITY;
  return createdA === createdB ? 0 : createdA < createdB ? 1 : -1;
}

/** The user's local calendar date as `YYYY-MM-DD` (BR-06). */
export function localDate(now: Date = new Date()): string {
  return format(now, 'yyyy-MM-dd');
}

/** The user's local time as `HH:mm`. */
export function localTime(now: Date = new Date()): string {
  return format(now, 'HH:mm');
}

/** `[accountId]`, or `[accountId, toAccountId]` for a transfer (§8 `accountIds`). */
export function accountIdsOf(tx: Pick<Transaction, 'accountId' | 'toAccountId'>): string[] {
  return tx.toAccountId ? [tx.accountId, tx.toAccountId] : [tx.accountId];
}

/** A "Balance adjustment" from reconciling, left out of totals and budgets (BR-12). */
export function isAdjustment(tx: Pick<Transaction, 'categoryId'>): boolean {
  return !!tx.categoryId && ADJUSTMENT_CATEGORY_IDS.includes(tx.categoryId);
}

/** Dated after today: it already counts in balances and shows as "Upcoming" (TXN-14, BR-10). */
export function isUpcoming(tx: Pick<Transaction, 'date'>, today: string): boolean {
  return tx.date > today;
}

/**
 * Lowercase, trimmed, without a leading `#`, without repeats, and at most
 * {@link MAX_TAGS} (§8 `tags`). `toLowerCase()` doesn't depend on the locale,
 * like Kotlin's `lowercase()`.
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const result: string[] = [];
  for (const tag of tags) {
    const clean = tag.trim().replace(/^#+/, '').trim().toLowerCase();
    if (clean && !result.includes(clean)) result.push(clean);
  }
  return result.slice(0, MAX_TAGS);
}

/** The fields a transaction is written with, for an edit to compare or a duplicate to copy. */
export function toNewTransaction(tx: Transaction): NewTransaction {
  return {
    type: tx.type,
    amount: tx.amount,
    currency: tx.currency,
    accountId: tx.accountId,
    toAccountId: tx.toAccountId ?? null,
    categoryId: tx.categoryId ?? null,
    date: tx.date,
    time: tx.time ?? null,
    payee: tx.payee ?? null,
    note: tx.note ?? null,
    tags: [...tx.tags],
    attachments: [...(tx.attachments ?? [])],
  };
}

/** What a user can change on a transaction (TXN-06, ATT-04). */
const EDITABLE_FIELDS = [
  'type',
  'amount',
  'currency',
  'accountId',
  'toAccountId',
  'categoryId',
  'date',
  'time',
  'payee',
  'note',
  'tags',
  'attachments',
] as const;

export type TransactionChanges = Partial<
  Pick<NewTransaction, (typeof EDITABLE_FIELDS)[number]> & { accountIds: string[] }
>;

/**
 * The fields `after` changes, so an edit writes only those and another device's
 * edits to other fields survive (SYN-03). A missing optional field and `null`
 * count as the same, as do no attachments and an empty list. Attachments
 * compare by Storage path. `accountIds` follows whenever either account changes.
 */
export function transactionChanges(before: Transaction, after: NewTransaction): TransactionChanges {
  const old = toNewTransaction(before);
  const next = toNewTransaction({ ...before, ...after });
  const changes: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    const a = old[field];
    const b = next[field];
    const same =
      field === 'attachments'
        ? sameAttachments(old.attachments!, next.attachments!)
        : Array.isArray(a) && Array.isArray(b)
          ? a.join('\n') === b.join('\n')
          : a === b;
    if (!same) changes[field] = b;
  }
  if ('accountId' in changes || 'toAccountId' in changes)
    changes['accountIds'] = accountIdsOf(next);
  return changes as TransactionChanges;
}

export interface Totals {
  income: number;
  expense: number;
  /** Income − expense (BR-04). */
  net: number;
}

/**
 * Income, expense and net in minor units. Transfers only move money (TXN-09)
 * and balance adjustments only correct it (BR-12), so neither counts.
 */
export function totalsOf(
  txs: readonly Pick<Transaction, 'type' | 'amount' | 'categoryId'>[],
): Totals {
  let income = 0;
  let expense = 0;
  for (const tx of txs) {
    if (isAdjustment(tx)) continue;
    if (tx.type === 'income') income += tx.amount;
    else if (tx.type === 'expense') expense += tx.amount;
  }
  return { income, expense, net: income - expense };
}

export interface DayGroup<T> {
  date: string;
  items: T[];
}

/** Items already sorted newest first, grouped into runs of the same date (LST-01). */
export function groupByDay<T extends { date: string }>(items: readonly T[]): DayGroup<T>[] {
  const days: DayGroup<T>[] = [];
  for (const item of items) {
    const last = days[days.length - 1];
    if (last?.date === item.date) last.items.push(item);
    else days.push({ date: item.date, items: [item] });
  }
  return days;
}

/**
 * A newest-first page without its oldest day while more pages remain: queries
 * page by date only, so that day may be cut short and out of time order. It
 * comes back whole with the next page. A page of one day is kept as it is.
 */
export function wholeDays<T extends { date: string }>(items: readonly T[], hasMore: boolean): T[] {
  if (!hasMore || !items.length) return [...items];
  const oldest = items[items.length - 1].date;
  const kept = items.filter((item) => item.date !== oldest);
  return kept.length ? kept : [...items];
}

/** What the list shows of a period (LST-02, LST-06, LST-07). Every part narrows the result. */
export interface TransactionFilter {
  type: TxType | null;
  /** Entries touching any of these accounts, on either side of a transfer. */
  accountIds: readonly string[];
  /** Entries in any of these categories; a parent brings its subcategories (CAT-07). */
  categoryIds: readonly string[];
  /** Entries carrying any of these tags. */
  tags: readonly string[];
  /** Inclusive bounds on `amount`, in minor units. */
  minAmount: number | null;
  maxAmount: number | null;
  /** Words to find in the payee, note or tags; every word must match. */
  search: string;
}

export const NO_FILTER: TransactionFilter = {
  type: null,
  accountIds: [],
  categoryIds: [],
  tags: [],
  minAmount: null,
  maxAmount: null,
  search: '',
};

/** How many filters are set, not counting the search box. */
export function activeFilterCount(filter: TransactionFilter): number {
  return (
    (filter.type ? 1 : 0) +
    filter.accountIds.length +
    filter.categoryIds.length +
    filter.tags.length +
    (filter.minAmount !== null || filter.maxAmount !== null ? 1 : 0)
  );
}

/** Whether every word of `search` appears in the payee, note or a tag, ignoring case (LST-06). */
export function matchesSearch(
  tx: Pick<Transaction, 'payee' | 'note' | 'tags'>,
  search: string,
): boolean {
  const words = search
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^#+/, ''))
    .filter(Boolean);
  if (!words.length) return true;
  const text = [tx.payee ?? '', tx.note ?? '', ...tx.tags].join('\n').toLowerCase();
  return words.every((word) => text.includes(word));
}

/** The entries that pass every part of the filter, in their original order (LST-02). */
export function filterTransactions<T extends Transaction>(
  txs: readonly T[],
  filter: TransactionFilter,
  categories: ReadonlyMap<string, Pick<Category, 'parentId'>>,
): T[] {
  const accounts = new Set(filter.accountIds);
  const categoryIds = new Set(filter.categoryIds);
  const tags = new Set(filter.tags);
  return txs.filter((tx) => {
    if (filter.type && tx.type !== filter.type) return false;
    if (accounts.size && !accountIdsOf(tx).some((id) => accounts.has(id))) return false;
    if (categoryIds.size) {
      const id = tx.categoryId;
      if (!id || !(categoryIds.has(id) || categoryIds.has(rollUpId(id, categories)))) return false;
    }
    if (tags.size && !tx.tags.some((tag) => tags.has(tag))) return false;
    if (filter.minAmount !== null && tx.amount < filter.minAmount) return false;
    if (filter.maxAmount !== null && tx.amount > filter.maxAmount) return false;
    return matchesSearch(tx, filter.search);
  });
}

/** Distinct payees from newest-first entries, most recent first, spelled as last written (TXN-12). */
export function payeeSuggestions(txs: readonly Pick<Transaction, 'payee'>[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tx of txs) {
    const payee = tx.payee?.trim();
    const key = payee?.toLowerCase();
    if (!payee || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(payee);
  }
  return result;
}

/** Distinct tags from newest-first entries, most recent first (TXN-12). */
export function tagSuggestions(txs: readonly Pick<Transaction, 'tags'>[]): string[] {
  const result = new Set<string>();
  for (const tx of txs) for (const tag of tx.tags) result.add(tag);
  return [...result];
}

/**
 * The category of the newest entry of this type with the same payee, ignoring
 * case (TXN-15), or null. Balance adjustments never suggest their category.
 */
export function suggestCategory(
  txs: readonly Pick<Transaction, 'type' | 'payee' | 'categoryId'>[],
  payee: string,
  type: CategoryType,
): string | null {
  const key = payee.trim().toLowerCase();
  if (!key) return null;
  const match = txs.find(
    (tx) =>
      tx.type === type &&
      !!tx.categoryId &&
      !isAdjustment(tx) &&
      tx.payee?.trim().toLowerCase() === key,
  );
  return match?.categoryId ?? null;
}

/** The type's categories from newest-first entries, most recently used first (§13 "recent first"). */
export function recentCategoryIds(
  txs: readonly Pick<Transaction, 'type' | 'categoryId'>[],
  type: CategoryType,
): string[] {
  const result = new Set<string>();
  for (const tx of txs) {
    if (tx.type === type && tx.categoryId && !isAdjustment(tx)) result.add(tx.categoryId);
  }
  return [...result];
}

/**
 * The entry in another category (TXN-13), or null when it can't take it or is
 * already there. Transfers have no category, and income and expense categories
 * stay with their own type.
 */
export function withCategory(
  tx: Transaction,
  category: Pick<Category, 'id' | 'type'>,
): NewTransaction | null {
  if (tx.type !== category.type || tx.categoryId === category.id) return null;
  return { ...toNewTransaction(tx), categoryId: category.id };
}

/**
 * The entry moved to another account (TXN-13), or null when it's already there
 * or is a transfer into that account, which can't also come from it. For a
 * transfer, the account it comes from moves.
 */
export function withAccount(tx: Transaction, accountId: string): NewTransaction | null {
  if (tx.accountId === accountId) return null;
  if (tx.type === 'transfer' && tx.toAccountId === accountId) return null;
  return { ...toNewTransaction(tx), accountId };
}
