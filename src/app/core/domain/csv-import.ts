// CSV import (DAT-02, Appendix B): pure functions that turn a parsed file's rows
// into transactions, mirrored in Kotlin. Reading the file (quotes, delimiters)
// is PapaParse's job. This maps columns to fields, reads dates and amounts,
// finds accounts and categories by name, and flags duplicates of entries the
// user already has (same date, amount, account and payee). Problems come back
// as codes, which the screens word (NFR-17).
import { Account } from '../models/account';
import { Category, CategoryType, SYSTEM_CATEGORY_IDS } from '../models/category';
import { NewTransaction, Transaction, TxType } from '../models/transaction';
import { MAX_CATEGORY_NAME, nameKey } from './category';
import { TAG_SEPARATOR } from './csv-export';
import { MAX_AMOUNT, parseDecimal } from './money';
import { DateRange } from './period';
import { MAX_NOTE_LENGTH, MAX_PAYEE_LENGTH, MAX_TAGS, normalizeTags } from './transactions';

/** What a column can fill. `moneyIn`/`moneyOut` stand in for one signed amount column. */
export const IMPORT_FIELDS = [
  'date',
  'time',
  'type',
  'amount',
  'moneyIn',
  'moneyOut',
  'currency',
  'account',
  'toAccount',
  'category',
  'subcategory',
  'payee',
  'note',
  'tags',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Which column (0-based) fills each field; a missing field is left empty. */
export type ColumnMap = Partial<Record<ImportField, number>>;

/** How a file writes its dates: year-month-day, day-month-year or month-day-year. */
export type DateOrder = 'ymd' | 'dmy' | 'mdy';
export const DATE_ORDERS: readonly DateOrder[] = ['ymd', 'dmy', 'mdy'];

/** One amount column whose sign or Type column gives the direction, or separate in and out columns. */
export type AmountMode = 'signed' | 'split';

export interface ImportMapping {
  columns: ColumnMap;
  dateOrder: DateOrder;
  decimalSeparator: '.' | ',';
  amountMode: AmountMode;
  /** The account for rows with no Account column, or an empty cell in it. */
  accountId: string | null;
}

/** What rows are matched against. Archived accounts and categories count: history can use them. */
export interface ImportContext {
  accounts: readonly Pick<Account, 'id' | 'name' | 'currency'>[];
  categories: readonly Pick<Category, 'id' | 'name' | 'type' | 'parentId'>[];
}

export type ImportErrorCode =
  | 'date_missing'
  | 'date_invalid'
  | 'amount_missing'
  | 'amount_invalid'
  | 'amount_zero'
  | 'amount_too_large'
  | 'amount_both'
  | 'type_invalid'
  | 'account_missing'
  | 'account_unknown'
  | 'to_account_missing'
  | 'to_account_unknown'
  | 'same_account'
  | 'currency_mismatch';

export type ImportWarningCode =
  'time_invalid' | 'payee_shortened' | 'note_shortened' | 'tags_dropped';

/** A problem with one row; `value` is the cell it's about, for the message. */
export interface ImportIssue<C extends string> {
  code: C;
  value?: string;
}

/** A category the import creates because the file names one the user doesn't have. */
export interface PlannedCategory {
  /** Stands in for the new category's ID in `categoryId` until it's written. */
  key: string;
  name: string;
  type: CategoryType;
  /** An existing parent, for a new subcategory. */
  parentId: string | null;
  /** A parent the import creates too. */
  parentKey: string | null;
}

export interface ImportRow {
  /** The row's line in the file, counting the header, for messages. */
  line: number;
  /** What would be written; null when the row has errors. `categoryId` may be a planned key. */
  tx: NewTransaction | null;
  errors: ImportIssue<ImportErrorCode>[];
  warnings: ImportIssue<ImportWarningCode>[];
  /** Matches an entry the user already has (DAT-02). */
  duplicate: boolean;
}

export interface ImportPlan {
  rows: ImportRow[];
  newCategories: PlannedCategory[];
  /** The dates the rows without errors span, to look up possible duplicates. */
  range: DateRange | null;
}

/** Prefix of planned category keys; real IDs never contain a colon. */
export const PLANNED_PREFIX = 'new:';

/** Header names each field is recognized by, compared trimmed and ignoring case. */
const HEADER_NAMES: Readonly<Record<ImportField, readonly string[]>> = {
  date: ['date', 'transaction date', 'posting date', 'posted', 'booking date', 'value date'],
  time: ['time'],
  type: ['type', 'transaction type', 'kind'],
  amount: ['amount', 'value', 'sum', 'total'],
  moneyIn: ['money in', 'paid in', 'credit', 'credits', 'deposit', 'deposits', 'in'],
  moneyOut: ['money out', 'paid out', 'debit', 'debits', 'withdrawal', 'withdrawals', 'out'],
  currency: ['currency', 'ccy'],
  account: ['account', 'account name', 'from account', 'wallet'],
  toAccount: ['to account', 'destination', 'destination account'],
  category: ['category'],
  subcategory: ['subcategory', 'sub category', 'sub-category'],
  payee: ['payee', 'description', 'merchant', 'name', 'details', 'narration', 'particulars'],
  note: ['note', 'notes', 'memo', 'comment', 'comments', 'remarks'],
  tags: ['tags', 'tag', 'labels'],
};

/**
 * Columns matched to fields by their header names, so an export from either
 * app (Appendix B) maps itself. Each column fills one field at most.
 */
export function guessColumns(headers: readonly string[]): ColumnMap {
  const keys = headers.map((h) => nameKey(h));
  const used = new Set<number>();
  const columns: ColumnMap = {};
  for (const field of IMPORT_FIELDS) {
    for (const name of HEADER_NAMES[field]) {
      const index = keys.findIndex((key, i) => key === name && !used.has(i));
      if (index >= 0) {
        columns[field] = index;
        used.add(index);
        break;
      }
    }
  }
  return columns;
}

/** A full starting mapping: guessed columns, and date order and decimals read from the data. */
export function guessMapping(
  headers: readonly string[],
  records: readonly (readonly string[])[],
  preferredOrder: DateOrder,
): ImportMapping {
  const columns = guessColumns(headers);
  const values = (field: ImportField) =>
    columns[field] === undefined ? [] : records.map((r) => r[columns[field]!] ?? '');
  return {
    columns,
    dateOrder: detectDateOrder(values('date'), preferredOrder) ?? preferredOrder,
    decimalSeparator: detectDecimalSeparator([
      ...values('amount'),
      ...values('moneyIn'),
      ...values('moneyOut'),
    ]),
    amountMode:
      columns.amount === undefined && (columns.moneyIn ?? columns.moneyOut) !== undefined
        ? 'split'
        : 'signed',
    accountId: null,
  };
}

/** What the mapping still needs before rows can be read. */
export function mappingGaps(mapping: ImportMapping): ('date' | 'amount' | 'account')[] {
  const { columns } = mapping;
  const gaps: ('date' | 'amount' | 'account')[] = [];
  if (columns.date === undefined) gaps.push('date');
  const hasAmount =
    mapping.amountMode === 'signed'
      ? columns.amount !== undefined
      : columns.moneyIn !== undefined || columns.moneyOut !== undefined;
  if (!hasAmount) gaps.push('amount');
  if (columns.account === undefined && !mapping.accountId) gaps.push('account');
  return gaps;
}

/**
 * The order that reads the most of the values, so one broken cell doesn't
 * decide it. Ties go to `preferred`, then year-first, day-first and
 * month-first. Null when no order reads any.
 */
export function detectDateOrder(values: readonly string[], preferred: DateOrder): DateOrder | null {
  const filled = values.map((v) => v.trim()).filter(Boolean);
  const orders = [preferred, ...DATE_ORDERS.filter((o) => o !== preferred)];
  let best: DateOrder | null = null;
  let bestCount = 0;
  for (const order of orders) {
    const count = filled.filter((v) => parseDate(v, order)).length;
    if (count > bestCount) {
      best = order;
      bestCount = count;
    }
  }
  return best;
}

/** A comma decimal when amounts end in ",dd" and none in ".dd"; otherwise a dot. */
export function detectDecimalSeparator(values: readonly string[]): '.' | ',' {
  let comma = 0;
  let dot = 0;
  for (const value of values) {
    if (/\d,\d{1,3}\s*\D*$/.test(value.trim()) && !/\d,\d{3}\s*\D*$/.test(value.trim())) comma++;
    if (/\d\.\d{1,3}\s*\D*$/.test(value.trim()) && !/\d\.\d{3}\s*\D*$/.test(value.trim())) dot++;
  }
  return comma > 0 && dot === 0 ? ',' : '.';
}

/**
 * A date cell as `YYYY-MM-DD`, plus the time when the cell carries one
 * ("2026-09-25 14:30", "2026-09-25T14:30:00"). Two-digit years are 20xx.
 * Null for text that isn't a real date in that order.
 */
export function parseDate(
  text: string,
  order: DateOrder,
): { date: string; time: string | null } | null {
  const match = /^(\d{1,4})[-/. ](\d{1,2})[-/. ](\d{1,4})(?:[T ,]+(.+))?$/.exec(text.trim());
  if (!match) return null;
  const parts = [match[1], match[2], match[3]].map(Number);
  const [y, m, d] =
    order === 'ymd'
      ? parts
      : order === 'dmy'
        ? [parts[2], parts[1], parts[0]]
        : [parts[2], parts[0], parts[1]];
  const yearText = order === 'ymd' ? match[1] : match[3];
  if (yearText.length !== 2 && yearText.length !== 4) return null;
  const year = yearText.length === 2 ? 2000 + y : y;
  if (year < 1900 || m < 1 || m > 12 || d < 1 || d > daysInMonth(year, m)) return null;
  const date = `${year}-${pad(m)}-${pad(d)}`;
  return { date, time: match[4] ? parseTime(match[4]) : null };
}

/** "9:05", "09:05:30", "2:30 PM" or "14.30" as `HH:mm`; null otherwise. */
export function parseTime(text: string): string | null {
  const match =
    /^(\d{1,2})[:.](\d{2})(?::\d{2}(?:\.\d+)?)?\s*([ap]\.?m\.?)?\s*(?:z|[+-]\d{2}:?\d{2})?$/i.exec(
      text.trim(),
    );
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.[0].toLowerCase();
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem === 'p' ? 12 : 0);
  }
  if (hours > 23 || minutes > 59) return null;
  return `${pad(hours)}:${pad(minutes)}`;
}

const TYPE_WORDS: Readonly<Record<string, TxType>> = {
  expense: 'expense',
  debit: 'expense',
  withdrawal: 'expense',
  payment: 'expense',
  out: 'expense',
  income: 'income',
  credit: 'income',
  deposit: 'income',
  in: 'income',
  transfer: 'transfer',
};

/** A Type cell: Appendix B's `income`/`expense`/`transfer`, or a bank's word for them. */
export function parseType(text: string): TxType | null {
  return TYPE_WORDS[nameKey(text)] ?? null;
}

/**
 * A value as written, without the `'` that exports put before a leading `=`,
 * `+`, `-` or `@` so spreadsheets don't run it as a formula (Appendix B).
 */
export function unescapeCell(value: string): string {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}

/**
 * Reads every row. `records` are the rows after the header; `firstLine` is the
 * line the first of them is on (2 with a header). Rows whose mapped cells are
 * all empty are skipped. Categories are matched by name within the entry's type,
 * a subcategory under its parent; names not found are planned as new categories
 * (only rows without errors plan any), and entries without one go to Uncategorized.
 * {@link categoriesToCreate} narrows them to the rows actually imported.
 */
export function planImport(
  records: readonly (readonly string[])[],
  mapping: ImportMapping,
  context: ImportContext,
  firstLine = 2,
): ImportPlan {
  const planned = new Map<string, PlannedCategory>();
  const rows: ImportRow[] = [];
  let start: string | null = null;
  let end: string | null = null;
  const mapped = Object.values(mapping.columns);

  for (const [i, record] of records.entries()) {
    if (mapped.every((col) => !(record[col] ?? '').trim())) continue;
    const row = readRow(record, mapping, context, planned);
    rows.push({ line: firstLine + i, ...row, duplicate: false });
    if (row.tx) {
      if (start === null || row.tx.date < start) start = row.tx.date;
      if (end === null || row.tx.date > end) end = row.tx.date;
    }
  }

  return {
    rows,
    newCategories: [...planned.values()],
    range: start !== null && end !== null ? { start, end } : null,
  };
}

/** What makes two entries the same for duplicate detection (DAT-02). */
export function duplicateKey(
  tx: Pick<Transaction, 'date' | 'amount' | 'accountId' | 'payee'>,
): string {
  return [tx.date, tx.amount, tx.accountId, nameKey(tx.payee ?? '')].join('\u0000');
}

/**
 * Flags rows that match an existing entry. Each existing entry matches one row
 * at most, so a file with two equal coffees against one already logged has one
 * duplicate and one new entry, and importing the same file twice flags it all.
 */
export function markDuplicates(
  rows: readonly ImportRow[],
  existing: readonly Pick<Transaction, 'date' | 'amount' | 'accountId' | 'payee'>[],
): ImportRow[] {
  const left = new Map<string, number>();
  for (const tx of existing) {
    const key = duplicateKey(tx);
    left.set(key, (left.get(key) ?? 0) + 1);
  }
  return rows.map((row) => {
    if (!row.tx) return row.duplicate ? { ...row, duplicate: false } : row;
    const key = duplicateKey(row.tx);
    const count = left.get(key) ?? 0;
    if (count > 0) left.set(key, count - 1);
    return row.duplicate === count > 0 ? row : { ...row, duplicate: count > 0 };
  });
}

/** The rows that get written: no errors, and not a duplicate unless duplicates are kept. */
export function rowsToImport(rows: readonly ImportRow[], skipDuplicates: boolean): ImportRow[] {
  return rows.filter((row) => row.tx && !(skipDuplicates && row.duplicate));
}

/** The planned categories these rows use, parents included, parents first. */
export function categoriesToCreate(
  plan: Pick<ImportPlan, 'newCategories'>,
  rows: readonly ImportRow[],
): PlannedCategory[] {
  const used = new Set(rows.map((row) => row.tx?.categoryId));
  const needed = new Set<string>();
  for (const category of plan.newCategories) {
    if (!used.has(category.key)) continue;
    needed.add(category.key);
    if (category.parentKey) needed.add(category.parentKey);
  }
  return plan.newCategories
    .filter((c) => needed.has(c.key))
    .sort((a, b) => Number(!!a.parentKey) - Number(!!b.parentKey));
}

function readRow(
  record: readonly string[],
  mapping: ImportMapping,
  context: ImportContext,
  planned: Map<string, PlannedCategory>,
): Omit<ImportRow, 'line' | 'duplicate'> {
  const cell = (field: ImportField) => {
    const col = mapping.columns[field];
    return col === undefined ? '' : unescapeCell(record[col] ?? '').trim();
  };
  const errors: ImportIssue<ImportErrorCode>[] = [];
  const warnings: ImportIssue<ImportWarningCode>[] = [];

  // Date, and a time from its own column or the date cell.
  const dateText = cell('date');
  const parsed = dateText ? parseDate(dateText, mapping.dateOrder) : null;
  if (!dateText) errors.push({ code: 'date_missing' });
  else if (!parsed) errors.push({ code: 'date_invalid', value: dateText });
  const timeText = cell('time');
  let time = parsed?.time ?? null;
  if (timeText) {
    time = parseTime(timeText);
    if (!time) warnings.push({ code: 'time_invalid', value: timeText });
  }

  // The account decides the currency, and so how many decimals the amount may have.
  const account = findAccount(cell('account'), mapping, context, errors, 'account');
  const currency = account?.currency ?? context.accounts[0]?.currency ?? '';
  const currencyText = cell('currency');
  if (account && currencyText && nameKey(currencyText) !== nameKey(account.currency)) {
    errors.push({ code: 'currency_mismatch', value: currencyText.toUpperCase() });
  }

  const typeText = cell('type');
  const typed = typeText ? parseType(typeText) : null;
  if (typeText && !typed) errors.push({ code: 'type_invalid', value: typeText });
  const signed = readAmount(mapping, cell, currency || 'USD', errors);
  const type: TxType | null = typed ?? signed?.type ?? null;
  const amount = signed ? Math.abs(signed.amount) : 0;
  if (signed && amount > MAX_AMOUNT) errors.push({ code: 'amount_too_large' });

  let toAccountId: string | null = null;
  if (type === 'transfer') {
    const to = findAccount(cell('toAccount'), null, context, errors, 'to_account');
    if (to && account && to.id === account.id) errors.push({ code: 'same_account' });
    toAccountId = to?.id ?? null;
  }

  let payee = cell('payee');
  if (payee.length > MAX_PAYEE_LENGTH) {
    payee = payee.slice(0, MAX_PAYEE_LENGTH).trim();
    warnings.push({ code: 'payee_shortened' });
  }
  let note = cell('note');
  if (note.length > MAX_NOTE_LENGTH) {
    note = note.slice(0, MAX_NOTE_LENGTH).trim();
    warnings.push({ code: 'note_shortened' });
  }
  const rawTags = cell('tags')
    .split(TAG_SEPARATOR)
    .map((t) => t.trim())
    .filter(Boolean);
  const tags = normalizeTags(rawTags);
  if (new Set(rawTags.map((t) => nameKey(t.replace(/^#+/, '')))).size > MAX_TAGS) {
    warnings.push({ code: 'tags_dropped' });
  }

  if (errors.length || !parsed || !account || !type || !signed)
    return { tx: null, errors, warnings };

  const categoryId =
    type === 'transfer'
      ? null
      : resolveCategory(type, cell('category'), cell('subcategory'), context, planned);
  return {
    tx: {
      type,
      amount,
      currency: account.currency,
      accountId: account.id,
      toAccountId,
      categoryId,
      date: parsed.date,
      time,
      payee: payee || null,
      note: note || null,
      tags,
    },
    errors,
    warnings,
  };
}

/** The amount with its sign, and the type the sign or column implies. */
function readAmount(
  mapping: ImportMapping,
  cell: (field: ImportField) => string,
  currency: string,
  errors: ImportIssue<ImportErrorCode>[],
): { amount: number; type: TxType } | null {
  const read = (field: ImportField): number | null | undefined => {
    const text = cell(field);
    if (!text) return undefined;
    const value = parseDecimal(text, currency, mapping.decimalSeparator);
    if (value === null) errors.push({ code: 'amount_invalid', value: text });
    return value;
  };

  if (mapping.amountMode === 'signed') {
    const value = read('amount');
    if (value === undefined) errors.push({ code: 'amount_missing' });
    if (value === undefined || value === null) return null;
    if (value === 0) {
      errors.push({ code: 'amount_zero' });
      return null;
    }
    return { amount: value, type: value < 0 ? 'expense' : 'income' };
  }

  const moneyIn = read('moneyIn');
  const moneyOut = read('moneyOut');
  if (moneyIn === null || moneyOut === null) return null;
  const hasIn = !!moneyIn;
  const hasOut = !!moneyOut;
  if (hasIn && hasOut) {
    errors.push({ code: 'amount_both' });
    return null;
  }
  if (!hasIn && !hasOut) {
    errors.push({ code: moneyIn === 0 || moneyOut === 0 ? 'amount_zero' : 'amount_missing' });
    return null;
  }
  return hasIn ? { amount: moneyIn!, type: 'income' } : { amount: moneyOut!, type: 'expense' };
}

function findAccount(
  name: string,
  mapping: ImportMapping | null,
  context: ImportContext,
  errors: ImportIssue<ImportErrorCode>[],
  prefix: 'account' | 'to_account',
): Pick<Account, 'id' | 'name' | 'currency'> | null {
  if (!name) {
    const fallback = mapping?.accountId
      ? context.accounts.find((a) => a.id === mapping.accountId)
      : undefined;
    if (!fallback) errors.push({ code: `${prefix}_missing` });
    return fallback ?? null;
  }
  const key = nameKey(name);
  const found = context.accounts.find((a) => nameKey(a.name) === key);
  if (!found) errors.push({ code: `${prefix}_unknown`, value: name });
  return found ?? null;
}

/**
 * The category for a Category cell and a Subcategory cell. A lone name that
 * isn't a top-level category may be a subcategory, if only one has that name.
 */
function resolveCategory(
  type: CategoryType,
  parentName: string,
  childName: string,
  context: ImportContext,
  planned: Map<string, PlannedCategory>,
): string {
  if (!parentName && !childName) return SYSTEM_CATEGORY_IDS[type].uncategorized;
  const topName = parentName || childName;
  const subName = parentName ? childName : '';
  const ofType = context.categories.filter((c) => c.type === type);
  const top = ofType.find((c) => !c.parentId && nameKey(c.name) === nameKey(topName));

  if (!subName) {
    if (top) return top.id;
    const subs = ofType.filter((c) => c.parentId && nameKey(c.name) === nameKey(topName));
    if (subs.length === 1) return subs[0].id;
    return plan(planned, type, topName, null, null);
  }
  if (top) {
    const sub = ofType.find((c) => c.parentId === top.id && nameKey(c.name) === nameKey(subName));
    return sub ? sub.id : plan(planned, type, subName, top.id, null);
  }
  const parentKey = plan(planned, type, topName, null, null);
  return plan(planned, type, subName, null, parentKey);
}

function plan(
  planned: Map<string, PlannedCategory>,
  type: CategoryType,
  rawName: string,
  parentId: string | null,
  parentKey: string | null,
): string {
  const name = rawName.slice(0, MAX_CATEGORY_NAME).trim();
  const parent = parentId ?? parentKey ?? '';
  const key = `${PLANNED_PREFIX}${type}:${parent}/${nameKey(name)}`;
  if (!planned.has(key)) planned.set(key, { key, name, type, parentId, parentKey });
  return key;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
