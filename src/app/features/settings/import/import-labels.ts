import {
  AmountMode,
  DateOrder,
  ImportErrorCode,
  ImportField,
  ImportIssue,
  ImportWarningCode,
} from '../../../core/domain/csv-import';
import { FileProblem, MAX_IMPORT_ROWS } from './import.store';

export const FIELD_LABELS: Readonly<Record<ImportField, string>> = {
  date: 'Date',
  time: 'Time',
  type: 'Type',
  amount: 'Amount',
  moneyIn: 'Money in',
  moneyOut: 'Money out',
  currency: 'Currency',
  account: 'Account',
  toAccount: 'To account',
  category: 'Category',
  subcategory: 'Subcategory',
  payee: 'Payee',
  note: 'Note',
  tags: 'Tags',
};

/** The optional fields, in the order the mapping step lists them. */
export const OPTIONAL_FIELDS: readonly ImportField[] = [
  'time',
  'category',
  'subcategory',
  'payee',
  'note',
  'tags',
  'toAccount',
  'currency',
];

export const DATE_ORDER_OPTIONS: readonly { value: DateOrder; label: string }[] = [
  { value: 'ymd', label: 'Year first (2026-09-25)' },
  { value: 'dmy', label: 'Day first (25/09/2026)' },
  { value: 'mdy', label: 'Month first (09/25/2026)' },
];

export const DECIMAL_OPTIONS: readonly { value: '.' | ','; label: string }[] = [
  { value: '.', label: 'Dot (1,234.50)' },
  { value: ',', label: 'Comma (1.234,50)' },
];

export const AMOUNT_MODE_OPTIONS: readonly { value: AmountMode; label: string }[] = [
  { value: 'signed', label: 'One amount column' },
  { value: 'split', label: 'Money in and money out' },
];

export const FILE_PROBLEMS: Readonly<Record<FileProblem, string>> = {
  unreadable: "That file couldn't be read. Pick it again.",
  empty: 'That file has no rows to import under its header.',
  too_many: `That file has more than ${MAX_IMPORT_ROWS.toLocaleString('en')} rows. Split it and import the parts.`,
};

const ERRORS: Readonly<Record<ImportErrorCode, (value: string) => string>> = {
  date_missing: () => 'No date.',
  date_invalid: (v) => `“${v}” isn't a date in the order chosen.`,
  amount_missing: () => 'No amount.',
  amount_invalid: (v) => `“${v}” isn't an amount.`,
  amount_zero: () => 'The amount is zero.',
  amount_too_large: () => 'The amount is too large.',
  amount_both: () => 'Has both money in and money out.',
  type_invalid: (v) => `“${v}” isn't a type. Use income, expense or transfer.`,
  account_missing: () => 'No account. Pick one for every row, or map the Account column.',
  account_unknown: (v) => `You have no account named “${v}”. Add it first.`,
  to_account_missing: () => 'A transfer needs a To account.',
  to_account_unknown: (v) => `You have no account named “${v}” to transfer to.`,
  same_account: () => 'A transfer needs two different accounts.',
  currency_mismatch: (v) => `It's in ${v}, a different currency from its account.`,
};

const WARNINGS: Readonly<Record<ImportWarningCode, (value: string) => string>> = {
  time_invalid: (v) => `“${v}” isn't a time, so it's left out.`,
  payee_shortened: () => 'The payee was shortened to 100 characters.',
  note_shortened: () => 'The note was shortened to 500 characters.',
  tags_dropped: () => 'Only the first 10 tags are kept.',
};

export function errorMessage(issue: ImportIssue<ImportErrorCode>): string {
  return ERRORS[issue.code](issue.value ?? '');
}

export function warningMessage(issue: ImportIssue<ImportWarningCode>): string {
  return WARNINGS[issue.code](issue.value ?? '');
}
