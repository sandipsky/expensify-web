// CSV and Excel export (DAT-01, DAT-05, Appendix B): pure functions that turn
// transactions into the rows both apps write, mirrored in Kotlin. Writing the
// file itself (quoting, the byte-order mark) happens where the file is made.
import { Category } from '../models/category';
import { Transaction } from '../models/transaction';
import { DateRange } from './period';
import { toDecimalString } from './money';

/** The header row, in order (Appendix B). Imports map these names automatically. */
export const CSV_HEADERS = [
  'Date',
  'Time',
  'Type',
  'Amount',
  'Currency',
  'Account',
  'To account',
  'Category',
  'Subcategory',
  'Payee',
  'Note',
  'Tags',
] as const;

/** Tags share one column, separated by this (Appendix B). */
export const TAG_SEPARATOR = '|';

/** Names the rows need; blank when an account or category no longer exists. */
export interface ExportNames {
  account(id: string | null | undefined): string | undefined;
  category(id: string | null | undefined): Pick<Category, 'name' | 'parentId'> | undefined;
}

/** A transaction's fields as Appendix B lays them out, before they become text or cells. */
export interface ExportRecord {
  date: string;
  time: string;
  type: Transaction['type'];
  /** Minor units, positive (BR-02). */
  amount: number;
  currency: string;
  account: string;
  toAccount: string;
  /** The top-level category; a subcategory's parent. */
  category: string;
  /** The subcategory, when the entry has one. */
  subcategory: string;
  payee: string;
  note: string;
  tags: string;
}

export function exportRecord(tx: Transaction, names: ExportNames): ExportRecord {
  const category = names.category(tx.categoryId);
  const parent = category?.parentId ? names.category(category.parentId) : undefined;
  return {
    date: tx.date,
    time: tx.time ?? '',
    type: tx.type,
    amount: tx.amount,
    currency: tx.currency,
    account: names.account(tx.accountId) ?? '',
    toAccount: tx.type === 'transfer' ? (names.account(tx.toAccountId) ?? '') : '',
    category: parent ? parent.name : (category?.name ?? ''),
    subcategory: parent ? category!.name : '',
    payee: tx.payee ?? '',
    note: tx.note ?? '',
    tags: tx.tags.join(TAG_SEPARATOR),
  };
}

/**
 * One CSV row (Appendix B): the amount in major units with a dot decimal and no
 * grouping, e.g. "12.50".
 */
export function csvRow(record: ExportRecord): string[] {
  return [
    record.date,
    record.time,
    record.type,
    toDecimalString(record.amount, record.currency),
    record.currency,
    record.account,
    record.toAccount,
    record.category,
    record.subcategory,
    record.payee,
    record.note,
    record.tags,
  ];
}

/**
 * Oldest first, as a statement reads: by date, then time (entries without one
 * first), then when they were created, then ID so both apps agree.
 */
export function exportOrder<T extends Pick<Transaction, 'id' | 'date' | 'time' | 'createdAt'>>(
  txs: readonly T[],
): T[] {
  return [...txs].sort(
    (a, b) =>
      compare(a.date, b.date) ||
      compare(a.time ?? '', b.time ?? '') ||
      (a.createdAt?.toMillis() ?? Infinity) - (b.createdAt?.toMillis() ?? Infinity) ||
      compare(a.id, b.id),
  );
}

/** `transactions-2026-09-01-to-2026-09-30.csv`, or `transactions-all.csv` for everything. */
export function exportFileName(range: DateRange | null, extension: string): string {
  const span = range ? `${range.start}-to-${range.end}` : 'all';
  return `transactions-${span}.${extension}`;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
