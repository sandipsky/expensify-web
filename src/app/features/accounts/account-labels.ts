import { amountOwed, creditUtilization, isLiability } from '../../core/domain/account';
import { ACCOUNT_TYPES, Account, AccountType } from '../../core/models/account';

export const ACCOUNT_TYPE_LABELS: Readonly<Record<AccountType, string>> = {
  cash: 'Cash',
  bank: 'Bank',
  credit_card: 'Credit card',
  wallet: 'Mobile wallet',
  savings: 'Savings',
  loan: 'Loan',
  other: 'Other',
};

/** Items for the type `l-select`. */
export const ACCOUNT_TYPE_OPTIONS = ACCOUNT_TYPES.map((value) => ({
  value,
  label: ACCOUNT_TYPE_LABELS[value],
}));

/** How an account's balance reads on screen. */
export interface BalanceView {
  caption: 'Balance' | 'Owed' | 'In credit';
  /** Minor units to display; an amount owed is shown as a positive number. */
  amount: number;
  /** A normal account below zero, shown in the expense color with its minus sign. */
  negative: boolean;
}

/** Cards and loans read as the amount owed, or "in credit" when overpaid (ACC-08). */
export function balanceView(account: Pick<Account, 'type' | 'currentBalance'>): BalanceView {
  const balance = account.currentBalance;
  if (isLiability(account.type)) {
    return balance > 0
      ? { caption: 'In credit', amount: balance, negative: false }
      : { caption: 'Owed', amount: amountOwed(balance), negative: false };
  }
  return { caption: 'Balance', amount: balance, negative: balance < 0 };
}

/** Utilization rounded for display (BR-11) with its bar color, or null without a limit. */
export function utilizationView(
  account: Pick<Account, 'type' | 'currentBalance' | 'creditLimit'>,
): { percent: number; variant: 'accent' | 'warn' | 'error' } | null {
  if (account.type !== 'credit_card') return null;
  const used = creditUtilization(account);
  if (used === null) return null;
  const percent = Math.round(used);
  return { percent, variant: used >= 100 ? 'error' : used >= 80 ? 'warn' : 'accent' };
}
