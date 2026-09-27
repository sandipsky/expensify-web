// Account rules (§3.3): pure functions shared by the accounts screens and, later, the dashboard.
import { Account, AccountType } from '../models/account';
import { SYSTEM_CATEGORY_IDS } from '../models/category';
import { TxCore, effects } from './balance';

/**
 * Icon (Material Symbols name) and hex color written to a new account of each type.
 * There's no icon or color picker yet, so these are what Android will draw too.
 */
export const ACCOUNT_TYPE_DEFAULTS: Readonly<Record<AccountType, { icon: string; color: string }>> =
  {
    cash: { icon: 'payments', color: '#36B37E' },
    bank: { icon: 'account_balance', color: '#2456E6' },
    credit_card: { icon: 'credit_card', color: '#AB20A9' },
    wallet: { icon: 'account_balance_wallet', color: '#00B8D9' },
    savings: { icon: 'savings', color: '#FFAB00' },
    loan: { icon: 'request_quote', color: '#FF4530' },
    other: { icon: 'wallet', color: '#646663' },
  };

/** Credit cards and loans hold money owed, so their balances read as amounts owed (ACC-08). */
export function isLiability(type: AccountType): boolean {
  return type === 'credit_card' || type === 'loan';
}

/**
 * Converts between a stored balance and what the form shows. For cards and loans
 * the form edits the amount owed, which is stored as a negative balance; other
 * types pass through. The conversion is its own inverse.
 */
export function flipForLiability(type: AccountType, value: number): number {
  // `|| 0` keeps -0 out of Firestore, where it would be stored as a double.
  return isLiability(type) ? -value || 0 : value;
}

/** What a negative balance owes, as a positive amount; 0 when the balance is zero or in credit. */
export function amountOwed(balance: number): number {
  return balance < 0 ? -balance : 0;
}

/**
 * Share of a credit card's limit in use, as an unrounded percentage (round only
 * for display, BR-11). Null when the account has no limit.
 */
export function creditUtilization(
  account: Pick<Account, 'currentBalance' | 'creditLimit'>,
): number | null {
  const limit = account.creditLimit;
  if (!limit || limit <= 0) return null;
  return (amountOwed(account.currentBalance) / limit) * 100;
}

/** Sum of the active accounts marked "include in total" (ACC-02, ACC-04, DSH-12). */
export function totalBalance(
  accounts: readonly Pick<Account, 'currentBalance' | 'includeInTotal' | 'archived'>[],
): number {
  return accounts
    .filter((a) => a.includeInTotal && !a.archived)
    .reduce((sum, a) => sum + a.currentBalance, 0);
}

export interface Adjustment {
  type: 'income' | 'expense';
  /** Positive, minor units. */
  amount: number;
  categoryId: string;
}

/**
 * The "Balance adjustment" transaction that moves `current` to `actual` (ACC-07):
 * income when the real balance is higher, expense when it's lower, none when
 * they already match. Both use the system categories left out of reports (BR-12).
 */
export function reconcileAdjustment(current: number, actual: number): Adjustment | null {
  const diff = actual - current;
  if (diff === 0) return null;
  return diff > 0
    ? { type: 'income', amount: diff, categoryId: SYSTEM_CATEGORY_IDS.income.adjustment }
    : { type: 'expense', amount: -diff, categoryId: SYSTEM_CATEGORY_IDS.expense.adjustment };
}

/**
 * The account's balance right after each transaction (ACC-06). `transactions`
 * must be sorted newest first and start at the newest one, since the walk goes
 * back from the current balance, which already includes future-dated entries
 * (BR-10).
 */
export function runningBalances(
  currentBalance: number,
  accountId: string,
  transactions: readonly TxCore[],
): number[] {
  let balance = currentBalance;
  return transactions.map((tx) => {
    const after = balance;
    balance -= effects(tx).get(accountId) ?? 0;
    return after;
  });
}
