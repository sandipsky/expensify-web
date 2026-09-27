import { Category } from '../models/category';
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  categoryPath,
  categoryTree,
  isNameTaken,
  parentCandidates,
  pickableCategories,
  replaceCategoryIds,
  rollUpId,
  suggestColor,
} from './category';

const cat = (id: string, overrides: Partial<Category> = {}): Category => ({
  id,
  name: id,
  type: 'expense',
  parentId: null,
  icon: 'category',
  color: '#DC2626',
  isSystem: false,
  archived: false,
  sortOrder: 0,
  createdAt: null,
  updatedAt: null,
  ...overrides,
});

const byId = (categories: Category[]) => new Map(categories.map((c) => [c.id, c]));

describe('category rules', () => {
  describe('isNameTaken (CAT-04)', () => {
    const categories = [
      cat('food', { name: 'Food' }),
      cat('coffee', { name: 'Coffee', parentId: 'food' }),
      cat('old', { name: 'Old stuff', archived: true }),
      cat('salary', { name: 'Salary', type: 'income' }),
    ];

    it('ignores case and surrounding spaces', () => {
      expect(isNameTaken(categories, { name: '  fOOD ', type: 'expense', parentId: null })).toBe(
        true,
      );
    });

    it('is scoped to the type and the parent', () => {
      expect(isNameTaken(categories, { name: 'Salary', type: 'expense', parentId: null })).toBe(
        false,
      );
      expect(isNameTaken(categories, { name: 'Coffee', type: 'expense', parentId: null })).toBe(
        false,
      );
      expect(isNameTaken(categories, { name: 'coffee', type: 'expense', parentId: 'food' })).toBe(
        true,
      );
    });

    it('counts archived categories, and skips the category being renamed', () => {
      expect(isNameTaken(categories, { name: 'old stuff', type: 'expense', parentId: null })).toBe(
        true,
      );
      expect(
        isNameTaken(categories, { id: 'food', name: 'FOOD', type: 'expense', parentId: null }),
      ).toBe(false);
    });
  });

  describe('categoryTree (CAT-01, CAT-07)', () => {
    it('lists active parents in order, each with its active subcategories', () => {
      const tree = categoryTree(
        [
          cat('b', { sortOrder: 2 }),
          cat('a', { sortOrder: 1 }),
          cat('a2', { parentId: 'a', sortOrder: 5 }),
          cat('a1', { parentId: 'a', sortOrder: 4 }),
          cat('a3', { parentId: 'a', archived: true }),
          cat('inc', { type: 'income' }),
          cat('sys', { isSystem: true }),
        ],
        'expense',
      );
      expect(tree.map((n) => [n.category.id, n.children.map((c) => c.id)])).toEqual([
        ['a', ['a1', 'a2']],
        ['b', []],
      ]);
    });

    it('hides subcategories under an archived parent, and lifts orphans to the top (CAT-03)', () => {
      const tree = categoryTree(
        [
          cat('gone', { archived: true }),
          cat('hidden', { parentId: 'gone' }),
          cat('orphan', { parentId: 'deleted-elsewhere' }),
        ],
        'expense',
      );
      expect(tree.map((n) => n.category.id)).toEqual(['orphan']);
    });

    it('breaks sortOrder ties by name', () => {
      const tree = categoryTree([cat('x', { name: 'Zoo' }), cat('y', { name: 'Art' })], 'expense');
      expect(tree.map((n) => n.category.name)).toEqual(['Art', 'Zoo']);
    });
  });

  it('offers pickers the visible categories with Uncategorized last and no Balance adjustment', () => {
    const picks = pickableCategories(
      [
        cat('exp_uncategorized', { isSystem: true, sortOrder: 9 }),
        cat('exp_adjustment', { isSystem: true, sortOrder: 10 }),
        cat('food', { sortOrder: 1 }),
        cat('coffee', { parentId: 'food' }),
        cat('rent', { sortOrder: 2 }),
        cat('old', { archived: true }),
      ],
      'expense',
    );
    expect(picks.map((c) => c.id)).toEqual(['food', 'coffee', 'rent', 'exp_uncategorized']);
  });

  describe('parentCandidates (CAT-07)', () => {
    const categories = [
      cat('food'),
      cat('coffee', { parentId: 'food' }),
      cat('rent'),
      cat('old', { archived: true }),
      cat('sys', { isSystem: true }),
      cat('salary', { type: 'income' }),
    ];

    it('offers active, user-managed top-level categories of the type other than itself', () => {
      expect(parentCandidates(categories, 'expense').map((c) => c.id)).toEqual(['food', 'rent']);
      expect(parentCandidates(categories, 'expense', categories[2]).map((c) => c.id)).toEqual([
        'food',
      ]);
    });

    it('offers none to a category that has subcategories, or to a system one', () => {
      expect(parentCandidates(categories, 'expense', categories[0])).toEqual([]);
      expect(parentCandidates(categories, 'expense', categories[4])).toEqual([]);
    });
  });

  it('rolls a subcategory up into its parent for reports (CAT-07)', () => {
    const map = byId([
      cat('food'),
      cat('coffee', { parentId: 'food' }),
      cat('lost', { parentId: 'x' }),
    ]);
    expect(rollUpId('coffee', map)).toBe('food');
    expect(rollUpId('food', map)).toBe('food');
    expect(rollUpId('lost', map)).toBe('lost');
    expect(rollUpId('unknown', map)).toBe('unknown');
  });

  it('names a subcategory after its parent', () => {
    const food = cat('food', { name: 'Food' });
    const coffee = cat('coffee', { name: 'Coffee', parentId: 'food' });
    expect(categoryPath(coffee, byId([food, coffee]))).toBe('Food › Coffee');
    expect(categoryPath(food, byId([food]))).toBe('Food');
  });

  it("moves a budget's deleted categories to the replacement without duplicates (CAT-06)", () => {
    const removed = new Set(['food', 'coffee']);
    expect(replaceCategoryIds(['food', 'coffee', 'rent'], removed, 'exp_uncategorized')).toEqual([
      'exp_uncategorized',
      'rent',
    ]);
    expect(replaceCategoryIds(['food'], removed, 'rent')).toEqual(['rent']);
    expect(replaceCategoryIds(['rent', 'food'], removed, 'rent')).toEqual(['rent']);
    expect(replaceCategoryIds([], removed, 'rent')).toEqual([]);
  });

  it("suggests the palette color the type's categories use least", () => {
    expect(suggestColor([], 'expense')).toBe(CATEGORY_COLORS[0]);
    const used = [
      cat('a', { color: CATEGORY_COLORS[0] }),
      cat('b', { color: CATEGORY_COLORS[1].toLowerCase() }),
      cat('c', { color: CATEGORY_COLORS[2], type: 'income' }),
    ];
    expect(suggestColor(used, 'expense')).toBe(CATEGORY_COLORS[2]);
  });

  it('keeps every palette color at 3:1 or more against its 12% tint (NFR-08)', () => {
    const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const linear = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const luminance = ([r, g, b]: number[]) =>
      0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    for (const color of CATEGORY_COLORS) {
      const rgb = channels(color);
      const tint = rgb.map((c) => Math.round(c * 0.12 + 255 * 0.88));
      const ratio = (luminance(tint) + 0.05) / (luminance(rgb) + 0.05);
      expect(ratio, color).toBeGreaterThanOrEqual(3);
    }
  });

  it('offers each icon once', () => {
    expect(new Set(CATEGORY_ICONS).size).toBe(CATEGORY_ICONS.length);
  });
});
