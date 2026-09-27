import { TestBed } from '@angular/core/testing';
import { CategoriesRepo } from '../../core/data/categories.repo';
import { LocalDb } from '../../core/data/local-db';
import { TransactionsRepo } from '../../core/data/transactions.repo';
import { CategoryInput } from '../../core/models/category';
import { CategoriesStore } from './categories.store';

const input = (overrides: Partial<CategoryInput> = {}): CategoryInput => ({
  name: 'Coffee',
  parentId: null,
  icon: 'local_cafe',
  color: '#B45309',
  ...overrides,
});

describe('CategoriesStore', () => {
  let store: CategoriesStore;
  let db: LocalDb;

  const names = (list: { name: string }[]) => list.map((c) => c.name);

  const spend = (categoryId: string) =>
    TestBed.inject(TransactionsRepo).add({
      type: 'expense',
      amount: 500,
      currency: 'USD',
      accountId: 'cash',
      categoryId,
      date: '2026-09-26',
      tags: [],
    });

  beforeEach(async () => {
    localStorage.clear();
    store = TestBed.inject(CategoriesStore);
    db = TestBed.inject(LocalDb);
    await db
      .batch()
      .set(`${db.userPath}/accounts/cash`, { name: 'Cash', currentBalance: 0 })
      .commit();
  });

  it('seeds the defaults, splits them by type and keeps system ones apart (CAT-01, CAT-05)', () => {
    store.seedDefaults();

    const { expense, income } = store.lists();
    expect(expense.tree).toHaveLength(17);
    expect(expense.tree[0].category.name).toBe('Food and dining');
    expect(names(expense.system)).toEqual(['Uncategorized', 'Balance adjustment']);
    expect(income.tree.map((n) => n.category.id)).toContain('inc_salary');
    expect(names(store.pickable().income).at(-1)).toBe('Uncategorized');
  });

  it('seeds only what is missing, so a renamed default survives (ONB-03)', () => {
    store.seedDefaults();
    store.update(store.byId('exp_food')!, input({ name: 'Eating out', icon: 'restaurant' }));
    TestBed.inject(CategoriesRepo).delete(['exp_travel']);

    store.seedDefaults();
    expect(store.byId('exp_food')!.name).toBe('Eating out');
    expect(store.byId('exp_travel')).toBeDefined();
    expect(store.all()).toHaveLength(29);
  });

  it('adds categories at the end of their type, with the system ones (CAT-02, CAT-05)', () => {
    const id = store.create('expense', input({ name: '  Coffee ' }));
    const rent = store.create('expense', input({ name: 'Rent' }));

    expect(store.byId(id)).toMatchObject({ name: 'Coffee', type: 'expense', isSystem: false });
    expect(store.byId(rent)!.sortOrder).toBeGreaterThan(store.byId(id)!.sortOrder);
    expect(names(store.lists().expense.system)).toEqual(['Uncategorized', 'Balance adjustment']);
    expect(store.byId('inc_uncategorized')).toBeDefined();
  });

  it('nests subcategories under their parent (CAT-07)', () => {
    const food = store.create('expense', input({ name: 'Food' }));
    store.create('expense', input({ name: 'Coffee', parentId: food }));

    const [node] = store.lists().expense.tree;
    expect(node.category.name).toBe('Food');
    expect(names(node.children)).toEqual(['Coffee']);
    expect(store.path(node.children[0])).toBe('Food › Coffee');
    expect(names(store.parentOptions('expense'))).toEqual(['Food']);
    expect(store.parentOptions('expense', node.category)).toEqual([]);
  });

  it('checks names per type and parent, ignoring case (CAT-04)', () => {
    const food = store.create('expense', input({ name: 'Food' }));
    expect(store.isNameTaken('food', 'expense', null)).toBe(true);
    expect(store.isNameTaken('food', 'income', null)).toBe(false);
    expect(store.isNameTaken('food', 'expense', food)).toBe(false);
    expect(store.isNameTaken('FOOD', 'expense', null, food)).toBe(false);
  });

  it('writes only the fields that changed, and never touches system categories', () => {
    const id = store.create('expense', input());
    const update = vi.spyOn(TestBed.inject(CategoriesRepo), 'update');

    store.update(store.byId(id)!, input({ name: 'Coffee ' }));
    expect(update).not.toHaveBeenCalled();

    store.update(store.byId(id)!, input({ color: '#DC2626' }));
    expect(update).toHaveBeenCalledWith(id, { color: '#DC2626' });

    store.update(store.byId('exp_uncategorized')!, input({ name: 'Misc' }));
    store.setArchived(store.byId('exp_uncategorized')!, true);
    expect(store.byId('exp_uncategorized')).toMatchObject({
      name: 'Uncategorized',
      archived: false,
    });
  });

  it('hides an archived parent with its subcategories, and restores a parent with its child (CAT-03)', () => {
    const food = store.create('expense', input({ name: 'Food' }));
    const coffee = store.create('expense', input({ name: 'Coffee', parentId: food }));
    store.setArchived(store.byId(coffee)!, true);
    store.setArchived(store.byId(food)!, true);

    expect(store.lists().expense.tree).toEqual([]);
    expect(names(store.pickable().expense)).toEqual(['Uncategorized']);
    expect(names(store.lists().expense.archived)).toEqual(['Food', 'Coffee']);

    const restored = store.restore(store.byId(coffee)!);
    expect(names(restored)).toEqual(['Food', 'Coffee']);
    expect(store.byId(food)!.archived).toBe(false);
    expect(store.byId(coffee)!.archived).toBe(false);
  });

  it('counts what uses a category and its subcategories (CAT-06)', async () => {
    const food = store.create('expense', input({ name: 'Food' }));
    const coffee = store.create('expense', input({ name: 'Coffee', parentId: food }));
    spend(food);
    spend(coffee);
    await db
      .batch()
      .set(`${db.userPath}/budgets/b1`, { name: 'Eating', categoryIds: [food, coffee] })
      .commit();

    const usage = await store.usage(store.byId(food)!);
    expect(names(usage.categories)).toEqual(['Food', 'Coffee']);
    expect(usage.transactions).toHaveLength(2);
    expect(usage.budgets.map((b) => b.id)).toEqual(['b1']);
  });

  it('deletes an unused category with its subcategories, and can undo it', async () => {
    const food = store.create('expense', input({ name: 'Food' }));
    store.create('expense', input({ name: 'Coffee', parentId: food }));

    const deleted = await store.delete(store.byId(food)!, null);
    expect(store.lists().expense.tree).toEqual([]);

    store.undoDelete(deleted.categories);
    expect(names(store.lists().expense.tree[0].children)).toEqual(['Coffee']);
  });

  it('moves the entries of a used category to the replacement before deleting it (CAT-06)', async () => {
    const food = store.create('expense', input({ name: 'Food' }));
    const rent = store.create('expense', input({ name: 'Rent' }));
    const tx = spend(food);

    await expect(store.delete(store.byId(food)!, null)).rejects.toThrow(/replacement/);
    await expect(store.delete(store.byId(food)!, food)).rejects.toThrow(/replacement/);
    expect(store.byId(food)).toBeDefined();

    const moved = await store.delete(store.byId(food)!, rent);
    expect(moved.transactions.map((t) => t.id)).toEqual([tx]);
    expect(store.byId(food)).toBeUndefined();
    const [onRent] = await TestBed.inject(TransactionsRepo).listByCategory(rent);
    expect(onRent.id).toBe(tx);
  });

  it('refuses to delete a system category (CAT-05)', async () => {
    store.seedDefaults();
    await expect(store.delete(store.byId('exp_uncategorized')!, null)).rejects.toThrow();
    expect(store.byId('exp_uncategorized')).toBeDefined();
  });

  it('offers every visible category but the deleted ones as a replacement', () => {
    const food = store.create('expense', input({ name: 'Food' }));
    store.create('expense', input({ name: 'Coffee', parentId: food }));
    store.create('expense', input({ name: 'Rent' }));
    expect(names(store.replacements(store.byId(food)!))).toEqual(['Rent', 'Uncategorized']);
  });
});
