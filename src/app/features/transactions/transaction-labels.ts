import { PERIOD_PRESETS, PeriodPreset } from '../../core/domain/period';
import { TX_TYPES, TxType } from '../../core/models/transaction';

export const TX_TYPE_LABELS: Readonly<Record<TxType, string>> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
};

/** Items for the type `l-segmented-control`: Expense first, the default (TXN-04). */
export const TX_TYPE_OPTIONS = TX_TYPES.map((value) => ({ value, label: TX_TYPE_LABELS[value] }));

export const PERIOD_LABELS: Readonly<Record<PeriodPreset, string>> = {
  this_month: 'This month',
  last_month: 'Last month',
  this_year: 'This year',
  custom: 'Custom',
};

/** Items for the period switcher (LST-02). */
export const PERIOD_OPTIONS = PERIOD_PRESETS.map((value) => ({
  value,
  label: PERIOD_LABELS[value],
}));

/** "1 transaction", "12 transactions". */
export function entries(count: number): string {
  return `${count} ${count === 1 ? 'transaction' : 'transactions'}`;
}
