import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { LocalDb } from '../../core/data/local-db';
import { TransactionsRepo } from '../../core/data/transactions.repo';
import { CategoryInput } from '../../core/models/category';
import { NotificationOptions, NotificationService } from '../../shared/components/ui/notification';
import { SheetService } from '../../shared/services/sheet.service';
import { CategoriesStore } from './categories.store';
import { CategoryActions } from './category-actions';
import { CategoryDelete, CategoryDeleteData } from './category-delete/category-delete';
import { CategoryForm } from './category-form/category-form';

const input = (overrides: Partial<CategoryInput> = {}): CategoryInput => ({
  name: 'Food',
  parentId: null,
  icon: 'restaurant',
  color: '#EA580C',
  ...overrides,
});

describe('CategoryActions', () => {
  let actions: CategoryActions;
  let store: CategoriesStore;
  let sheetResult: string | undefined;
  const open = vi.fn();
  const toasts = { success: vi.fn(), info: vi.fn() };

  /** The Undo handler of the last toast of that kind. */
  const undo = (kind: 'success' | 'info') =>
    (toasts[kind].mock.lastCall![2] as NotificationOptions).action!.handler;

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
    vi.clearAllMocks();
    sheetResult = undefined;
    open.mockImplementation(() => of(sheetResult));
    TestBed.configureTestingModule({
      providers: [
        { provide: SheetService, useValue: { open } },
        { provide: NotificationService, useValue: toasts },
      ],
    });
    actions = TestBed.inject(CategoryActions);
    store = TestBed.inject(CategoriesStore);
    const db = TestBed.inject(LocalDb);
    await db
      .batch()
      .set(`${db.userPath}/accounts/cash`, { name: 'Cash', currentBalance: 0 })
      .commit();
  });

  it('opens the form to add a category or a subcategory, or to edit one', () => {
    const food = store.byId(store.create('expense', input()))!;
    actions.create('income').subscribe();
    actions.create('expense', food.id).subscribe();
    actions.edit(food);

    expect(open.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      [CategoryForm, { type: 'income', parentId: null }],
      [CategoryForm, { type: 'expense', parentId: food.id }],
      [CategoryForm, { category: food }],
    ]);
  });

  it('archives at once, with Undo, saying what else it hides (CAT-03)', () => {
    const food = store.byId(store.create('expense', input()))!;
    store.create('expense', input({ name: 'Coffee', parentId: food.id }));
    actions.archive(food);

    expect(store.byId(food.id)!.archived).toBe(true);
    expect(toasts.success).toHaveBeenCalledWith(
      'Category archived',
      'Food and its 1 subcategory are hidden from pickers.',
      expect.anything(),
    );
    undo('success')();
    expect(store.byId(food.id)!.archived).toBe(false);
  });

  it('deletes an unused category at once, with Undo', async () => {
    const food = store.byId(store.create('expense', input()))!;
    expect(await actions.delete(food)).toBe(true);

    expect(open).not.toHaveBeenCalled();
    expect(store.byId(food.id)).toBeUndefined();
    undo('info')();
    expect(store.byId(food.id)).toMatchObject({ name: 'Food' });
  });

  it('asks where the entries of a used category go, then moves them and deletes it (CAT-06)', async () => {
    const food = store.byId(store.create('expense', input()))!;
    const rent = store.create('expense', input({ name: 'Rent' }));
    const tx = spend(food.id);
    sheetResult = rent;

    expect(await actions.delete(food)).toBe(true);
    const data = open.mock.lastCall![1] as CategoryDeleteData;
    expect(open.mock.lastCall![0]).toBe(CategoryDelete);
    expect(data.usage.transactions.map((t) => t.id)).toEqual([tx]);

    expect(store.byId(food.id)).toBeUndefined();
    expect((await TestBed.inject(TransactionsRepo).listByCategory(rent))[0].id).toBe(tx);
    expect(toasts.success).toHaveBeenCalledWith('Category deleted', '1 transaction moved to Rent.');
  });

  it('keeps a used category when the replacement step is cancelled', async () => {
    const food = store.byId(store.create('expense', input()))!;
    spend(food.id);
    expect(await actions.delete(food)).toBe(false);
    expect(store.byId(food.id)).toBeDefined();
  });

  it('never deletes a system category (CAT-05)', async () => {
    store.seedDefaults();
    expect(await actions.delete(store.byId('exp_uncategorized')!)).toBe(false);
    expect(store.byId('exp_uncategorized')).toBeDefined();
  });

  it('restores a subcategory together with its archived parent', () => {
    const food = store.byId(store.create('expense', input()))!;
    const coffee = store.byId(
      store.create('expense', input({ name: 'Coffee', parentId: food.id })),
    )!;
    store.setArchived(coffee, true);
    store.setArchived(food, true);

    actions.restore(store.byId(coffee.id)!);
    expect(toasts.success).toHaveBeenCalledWith('Category restored', 'Coffee, with Food');
    expect(store.lists().expense.tree[0].children.map((c) => c.name)).toEqual(['Coffee']);
  });
});
