import { TimestampLike } from './timestamp';

/** `accounts.type` values (§8). Lowercase strings shared with Android. */
export const ACCOUNT_TYPES = [
  'cash',
  'bank',
  'credit_card',
  'wallet',
  'savings',
  'loan',
  'other',
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** `users/{uid}/accounts/{accountId}` (§8). Amounts are integer minor units. */
export interface Account {
  id: string;
  /** 1–40 characters. */
  name: string;
  type: AccountType;
  /** ISO 4217; the base currency until multi-currency. */
  currency: string;
  /** May be negative (cards, loans, overdrafts). */
  openingBalance: number;
  /** Opening balance plus every transaction's effect; changed only with `increment()`. */
  currentBalance: number;
  /** Credit cards only. */
  creditLimit?: number | null;
  /** Material Symbols name. */
  icon: string;
  /** Hex color, e.g. `#2456E6`. */
  color: string;
  includeInTotal: boolean;
  archived: boolean;
  sortOrder: number;
  createdAt: TimestampLike | null;
  updatedAt: TimestampLike | null;
  /** Local only: the document has writes the server hasn't confirmed (SYN-04). */
  pending?: boolean;
}

/** The user-editable fields of an account, as the form produces them. */
export interface AccountInput {
  name: string;
  type: AccountType;
  openingBalance: number;
  creditLimit: number | null;
  includeInTotal: boolean;
}
