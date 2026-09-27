// Category rules (§3.4): pure functions shared by the categories screens and, later,
// the transaction form's picker, reports and budgets.
import { ADJUSTMENT_CATEGORY_IDS, Category, CategoryType } from '../models/category';

/** Longest category name (§8). */
export const MAX_CATEGORY_NAME = 30;

/**
 * The colors a category can take, as the hex values stored in Firestore. Each
 * keeps at least 3:1 contrast against its own 12% tint, the icon badge's
 * background (NFR-08).
 */
export const PALETTE = {
  red: '#DC2626',
  orange: '#EA580C',
  amber: '#B45309',
  green: '#15803D',
  teal: '#0D9488',
  sky: '#0284C7',
  blue: '#2456E6',
  indigo: '#4F46E5',
  purple: '#9333EA',
  pink: '#DB2777',
  brown: '#8D6E63',
  slate: '#64748B',
} as const;

export type PaletteColor = keyof typeof PALETTE;

export const CATEGORY_COLORS: readonly string[] = Object.values(PALETTE);

/**
 * Material Symbols names the icon picker offers: the generic default first, then
 * roughly by theme. Every Appendix A icon is here except the system ones (`help`,
 * `tune`) and `card_giftcard`, which draws the same glyph as `redeem`.
 */
export const CATEGORY_ICONS = [
  'category',
  'restaurant',
  'local_cafe',
  'fastfood',
  'local_bar',
  'shopping_cart',
  'directions_bus',
  'directions_car',
  'local_taxi',
  'train',
  'flight',
  'local_gas_station',
  'home',
  'apartment',
  'bolt',
  'water_drop',
  'wifi',
  'phone_iphone',
  'build',
  'shopping_bag',
  'checkroom',
  'computer',
  'medical_services',
  'medication',
  'fitness_center',
  'spa',
  'content_cut',
  'family_restroom',
  'child_care',
  'pets',
  'school',
  'movie',
  'music_note',
  'sports_esports',
  'celebration',
  'beach_access',
  'redeem',
  'volunteer_activism',
  'payments',
  'work',
  'star',
  'savings',
  'account_balance',
  'trending_up',
  'receipt_long',
  'shield',
  'autorenew',
  'undo',
  'add_circle',
] as const;

/** A new category's icon until the user picks one. */
export const DEFAULT_CATEGORY_ICON = 'category';

type Named = Pick<Category, 'id' | 'name' | 'type' | 'parentId'>;

/**
 * How names compare for uniqueness: trimmed and ignoring case (CAT-04).
 * `toLowerCase()` doesn't depend on the locale, like Kotlin's `lowercase()`.
 */
export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Whether another category of the same type under the same parent already has
 * this name, ignoring case (CAT-04). Archived categories count, so restoring
 * one can never make a duplicate. Pass the category's own `id` when renaming it.
 */
export function isNameTaken(
  categories: readonly Named[],
  candidate: Omit<Named, 'id'> & { id?: string },
): boolean {
  const key = nameKey(candidate.name);
  const parentId = candidate.parentId ?? null;
  return categories.some(
    (c) =>
      c.id !== candidate.id &&
      c.type === candidate.type &&
      (c.parentId ?? null) === parentId &&
      nameKey(c.name) === key,
  );
}

/** By `sortOrder`, then name. Reordering (CAT-08) will set `sortOrder`. */
export function compareCategories(
  a: Pick<Category, 'sortOrder' | 'name'>,
  b: Pick<Category, 'sortOrder' | 'name'>,
): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

/** A top-level category with its subcategories. */
export interface CategoryNode {
  category: Category;
  children: Category[];
}

/**
 * The type's active, user-managed categories as parents followed by their
 * active subcategories (CAT-01, CAT-07). System categories are left out, a
 * subcategory under an archived parent is hidden with it (CAT-03), and one
 * whose parent no longer exists counts as top-level.
 */
export function categoryTree(categories: readonly Category[], type: CategoryType): CategoryNode[] {
  const ids = new Set(categories.map((c) => c.id));
  const active = categories.filter((c) => c.type === type && !c.isSystem && !c.archived);
  const isTopLevel = (c: Category) => !c.parentId || !ids.has(c.parentId);
  return active
    .filter(isTopLevel)
    .sort(compareCategories)
    .map((category) => ({
      category,
      children: active.filter((c) => c.parentId === category.id).sort(compareCategories),
    }));
}

/**
 * What a picker offers for the type: every visible category, each parent
 * followed by its subcategories, then Uncategorized. Balance adjustment is left
 * out, since only reconciling uses it (BR-12).
 */
export function pickableCategories(
  categories: readonly Category[],
  type: CategoryType,
): Category[] {
  const system = categories
    .filter(
      (c) =>
        c.type === type && c.isSystem && !c.archived && !ADJUSTMENT_CATEGORY_IDS.includes(c.id),
    )
    .sort(compareCategories);
  return [
    ...categoryTree(categories, type).flatMap((node) => [node.category, ...node.children]),
    ...system,
  ];
}

/**
 * Where a category may sit (CAT-07): the type's active, user-managed top-level
 * categories other than itself. None when it has subcategories of its own,
 * since they go one level deep, or when it's a system category.
 */
export function parentCandidates(
  categories: readonly Category[],
  type: CategoryType,
  category?: Pick<Category, 'id' | 'isSystem'>,
): Category[] {
  if (category && (category.isSystem || categories.some((c) => c.parentId === category.id))) {
    return [];
  }
  return categories
    .filter(
      (c) => c.type === type && !c.parentId && !c.isSystem && !c.archived && c.id !== category?.id,
    )
    .sort(compareCategories);
}

/**
 * The top-level category an entry counts toward, so reports roll subcategories
 * up into their parent (CAT-07). A category whose parent is gone stands alone.
 */
export function rollUpId(
  categoryId: string,
  byId: ReadonlyMap<string, Pick<Category, 'parentId'>>,
): string {
  const parentId = byId.get(categoryId)?.parentId;
  return parentId && byId.has(parentId) ? parentId : categoryId;
}

/** "Food and dining › Groceries" for a subcategory; the name alone otherwise. */
export function categoryPath(
  category: Pick<Category, 'name' | 'parentId'>,
  byId: ReadonlyMap<string, Pick<Category, 'name'>>,
): string {
  const parent = category.parentId ? byId.get(category.parentId) : undefined;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

/**
 * A budget's `categoryIds` with deleted categories swapped for their
 * replacement, without duplicates (CAT-06). A list that named any category
 * still does afterwards, so a budget never widens to every expense.
 */
export function replaceCategoryIds(
  ids: readonly string[],
  removed: ReadonlySet<string>,
  replacementId: string,
): string[] {
  const next: string[] = [];
  for (const id of ids) {
    const kept = removed.has(id) ? replacementId : id;
    if (!next.includes(kept)) next.push(kept);
  }
  return next;
}

/**
 * The palette color the type's categories use least, first in palette order on
 * a tie, so new categories don't all look alike.
 */
export function suggestColor(
  categories: readonly Pick<Category, 'type' | 'color'>[],
  type: CategoryType,
): string {
  const uses = new Map(CATEGORY_COLORS.map((color) => [color, 0]));
  for (const c of categories) {
    const color = c.color.toUpperCase();
    if (c.type === type && uses.has(color)) uses.set(color, uses.get(color)! + 1);
  }
  return CATEGORY_COLORS.reduce((best, color) =>
    uses.get(color)! < uses.get(best)! ? color : best,
  );
}
