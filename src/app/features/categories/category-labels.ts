import { CATEGORY_ICONS, PALETTE, PaletteColor } from '../../core/domain/category';
import {
  ADJUSTMENT_CATEGORY_IDS,
  CATEGORY_TYPES,
  Category,
  CategoryType,
} from '../../core/models/category';
import { RadioOption } from '../../shared/components/ui/input/input';

export const CATEGORY_TYPE_LABELS: Readonly<Record<CategoryType, string>> = {
  expense: 'Expense',
  income: 'Income',
};

/** Items for the type `l-segmented-control`. */
export const CATEGORY_TYPE_OPTIONS = CATEGORY_TYPES.map((value) => ({
  value,
  label: CATEGORY_TYPE_LABELS[value],
}));

const COLOR_LABELS: Readonly<Record<PaletteColor, string>> = {
  red: 'Red',
  orange: 'Orange',
  amber: 'Amber',
  green: 'Green',
  teal: 'Teal',
  sky: 'Sky blue',
  blue: 'Blue',
  indigo: 'Indigo',
  purple: 'Purple',
  pink: 'Pink',
  brown: 'Brown',
  slate: 'Slate',
};

/** Swatches for `l-color-picker`, named for screen readers. */
export const COLOR_OPTIONS: readonly RadioOption[] = (Object.keys(PALETTE) as PaletteColor[]).map(
  (key) => ({ value: PALETTE[key], label: COLOR_LABELS[key] }),
);

/** Tiles for `l-icon-picker`, named after the symbol ("local_cafe" reads "local cafe"). */
export const ICON_OPTIONS: readonly RadioOption[] = CATEGORY_ICONS.map((value) => ({
  value,
  label: value.replaceAll('_', ' '),
}));

/** What each system category is for, shown under its name (CAT-05, BR-12). */
export function systemCaption(category: Pick<Category, 'id'>): string {
  return ADJUSTMENT_CATEGORY_IDS.includes(category.id)
    ? 'Records reconciled balances; left out of reports and budgets'
    : "For entries that don't fit another category";
}

/** "1 transaction", "12 transactions". */
export function countOf(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** What uses a category, as "12 transactions and 1 budget", or "…, 1 budget and 1 recurring rule". */
export function usageSummary(usage: {
  transactions: readonly unknown[];
  budgets: readonly unknown[];
  rules?: readonly unknown[];
}): string {
  const parts = [
    usage.transactions.length ? countOf(usage.transactions.length, 'transaction') : '',
    usage.budgets.length ? countOf(usage.budgets.length, 'budget') : '',
    usage.rules?.length ? countOf(usage.rules.length, 'recurring rule') : '',
  ].filter(Boolean);
  const last = parts.pop();
  return parts.length ? `${parts.join(', ')} and ${last}` : (last ?? '');
}
