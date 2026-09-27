export type CategoryType = 'income' | 'expense';

/**
 * Fixed IDs of the system categories seeded in Appendix A. They can't be deleted,
 * so transactions may reference them before the categories feature has loaded.
 */
export const SYSTEM_CATEGORY_IDS = {
  income: { uncategorized: 'inc_uncategorized', adjustment: 'inc_adjustment' },
  expense: { uncategorized: 'exp_uncategorized', adjustment: 'exp_adjustment' },
} as const satisfies Record<CategoryType, Record<string, string>>;

/** "Balance adjustment" categories, left out of reports and budgets (BR-12). */
export const ADJUSTMENT_CATEGORY_IDS: readonly string[] = [
  SYSTEM_CATEGORY_IDS.income.adjustment,
  SYSTEM_CATEGORY_IDS.expense.adjustment,
];
