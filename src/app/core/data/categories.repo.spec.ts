import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DEFAULT_CATEGORIES } from '../domain/default-categories';
import { Budget } from '../models/budget';
import { BudgetsRepo } from './budgets.repo';
import { CategoriesRepo, NewCategory } from './categories.repo';
import { LocalDb } from './local-db';
import { TransactionsRepo } from './transactions.repo';
import { WriteErrors } from './write-errors';

const newCategory = (overrides: Partial<NewCategory> = {}): NewCategory => ({
  name: 'Coffee',
  type: 'expense',
  parentId: null,
  icon: 'local_cafe',
  color: '#B45309',
  isSystem: false,
  archived: false,
  sortOrder: 0,
  ...overrides,
});

describe('CategoriesRepo', () => {
  let repo: CategoriesRepo;
  let db: LocalDb;
  let report: ReturnType<typeof vi.fn<(error: unknown) => void>>;

  const all = () => firstValueFrom(repo.watchAll());

  /** Writes a budget straight to the database; there's no budgets feature yet. */
  const addBudget = async (id: string, categoryIds: string[]) => {
    const budget: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'> = {
      name: 'Monthly',
      amount: 50000,
      period: 'monthly',
      categoryIds,
      rollover: false,
      alertThresholds: [80, 100],
      active: true,
    };
    await db.batch().set(`${db.userPath}/budgets/${id}`, budget).commit();
  };

  beforeEach(() => {
    localStorage.clear();
    repo = TestBed.inject(CategoriesRepo);
    db = TestBed.inject(LocalDb);
    report = vi.fn<(error: unknown) => void>();
    TestBed.inject(WriteErrors).report = report;
  });

  it('creates categories with audit fields, listed by sortOrder', async () => {
    repo.create(newCategory({ name: 'Rent', sortOrder: 2 }));
    const id = repo.create(newCategory({ sortOrder: 1 }));
    const [first, second] = await all();
    expect(first).toMatchObject({ id, name: 'Coffee', parentId: null, pending: false });
    expect(first.createdAt?.toMillis()).toBeGreaterThan(0);
    expect(second.name).toBe('Rent');
  });

  it('seeds categories under their fixed IDs (ONB-03)', async () => {
    repo.seed(DEFAULT_CATEGORIES.slice(0, 2));
    repo.seed([]);
    expect((await all()).map((c) => c.id)).toEqual(['exp_food', 'exp_groceries']);
  });

  it('writes only the fields an edit passes (SYN-03)', async () => {
    const id = repo.create(newCategory());
    repo.update(id, { name: 'Café', color: '#DC2626' });
    expect((await all())[0]).toMatchObject({ name: 'Café', color: '#DC2626', icon: 'local_cafe' });
  });

  it('archives and restores several categories in one write (CAT-03)', async () => {
    const a = repo.create(newCategory({ name: 'A', sortOrder: 0 }));
    const b = repo.create(newCategory({ name: 'B', sortOrder: 1 }));
    repo.setArchived([a, b], true);
    expect((await all()).map((c) => c.archived)).toEqual([true, true]);
    repo.setArchived([b], false);
    expect((await all()).map((c) => c.archived)).toEqual([true, false]);
  });

  it('deletes categories and puts them back under their old IDs (Undo)', async () => {
    const id = repo.create(newCategory());
    const [category] = await all();
    repo.delete([id]);
    expect(await all()).toEqual([]);
    repo.restore([category]);
    expect((await all())[0]).toMatchObject({ id, name: 'Coffee', createdAt: category.createdAt });
  });

  it('moves transactions and budgets to the replacement in the same write (CAT-06)', async () => {
    const food = repo.create(newCategory({ name: 'Food' }));
    const coffee = repo.create(newCategory({ name: 'Coffee', parentId: food }));
    const rent = repo.create(newCategory({ name: 'Rent' }));
    const transactions = TestBed.inject(TransactionsRepo);
    const add = (categoryId: string) =>
      transactions.add({
        type: 'expense',
        amount: 500,
        currency: 'USD',
        accountId: 'cash',
        categoryId,
        date: '2026-09-26',
        tags: [],
      });
    await db
      .batch()
      .set(`${db.userPath}/accounts/cash`, { name: 'Cash', currentBalance: 0 })
      .commit();
    const onFood = add(food);
    const onCoffee = add(coffee);
    const onRent = add(rent);
    await addBudget('eating', [food, coffee]);
    await addBudget('home', [rent]);

    const moved = [
      ...(await transactions.listByCategory(food)),
      ...(await transactions.listByCategory(coffee)),
    ];
    const budgets = TestBed.inject(BudgetsRepo);
    repo.delete([food, coffee], {
      replacementId: 'exp_uncategorized',
      transactions: moved,
      budgets: await budgets.listByCategory(food),
    });

    expect((await all()).map((c) => c.id)).toEqual([rent]);
    expect(
      (await transactions.listByCategory('exp_uncategorized')).map((t) => t.id).sort(),
    ).toEqual([onFood, onCoffee].sort());
    expect((await transactions.listByCategory(rent)).map((t) => t.id)).toEqual([onRent]);
    expect((await budgets.listByCategory('exp_uncategorized'))[0].categoryIds).toEqual([
      'exp_uncategorized',
    ]);
    expect((await budgets.listByCategory(rent))[0].id).toBe('home');
    // Balances don't depend on the category.
    const [cash] = await db.get(`${db.userPath}/accounts`);
    expect(cash.data['currentBalance']).toBe(-1500);
    expect(report).not.toHaveBeenCalled();
  });

  it('reports a failed write instead of throwing', async () => {
    repo.update('missing', { name: 'X' });
    await Promise.resolve();
    expect(report).toHaveBeenCalledOnce();
  });

  it('fills fields an older or Android-written document lacks', async () => {
    await db.batch().set(`${db.userPath}/categories/x`, { name: 'Pets', type: 'expense' }).commit();
    expect((await all())[0]).toMatchObject({
      parentId: null,
      icon: 'category',
      color: '#64748B',
      isSystem: false,
      archived: false,
      sortOrder: 0,
      createdAt: null,
    });
  });
});
