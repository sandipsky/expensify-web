import { TimestampLike } from './timestamp';

/** `categories.type` values (§8). Lowercase strings shared with Android. */
export const CATEGORY_TYPES = ['expense', 'income'] as const;

export type CategoryType = (typeof CATEGORY_TYPES)[number];

/** `users/{uid}/categories/{categoryId}` (§8). */
export interface Category {
  id: string;
  /** 1–30 characters, unique per type and parent, ignoring case (CAT-04). */
  name: string;
  type: CategoryType;
  /** Null at the top level; subcategories are one level deep (CAT-07). */
  parentId: string | null;
  /** Material Symbols name. */
  icon: string;
  /** Hex color, e.g. `#EA580C`. */
  color: string;
  /** Uncategorized and Balance adjustment: can't be changed or deleted (CAT-05). */
  isSystem: boolean;
  /** Hidden from pickers; existing transactions keep it (CAT-03). */
  archived: boolean;
  sortOrder: number;
  createdAt: TimestampLike | null;
  updatedAt: TimestampLike | null;
  /** Local only: the document has writes the server hasn't confirmed (SYN-04). */
  pending?: boolean;
}

/** The user-editable fields of a category, as the form produces them. */
export interface CategoryInput {
  name: string;
  parentId: string | null;
  icon: string;
  color: string;
}

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
