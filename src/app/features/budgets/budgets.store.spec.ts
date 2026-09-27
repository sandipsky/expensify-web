import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BudgetsRepo } from '../../core/data/budgets.repo';
import { LocalDb } from '../../core/data/local-db';
import { TransactionsRepo } from '../../core/data/transactions.repo';
import { BudgetInput } from '../../core/models/budget';
import { NewTransaction } from '../../core/models/transaction';
import { Preferences } from '../../core/preferences';
import { AccountsStore } from '../accounts/accounts.store';
import { CategoriesStore } from '../categories/categories.store';
import { BudgetsStore } from './budgets.store';

const input = (overrides: Partial<BudgetInput> = {}): BudgetInput => ({
  name: 'Food',
  amount: 50000,
  period: 'monthly',
  categoryIds: ['exp_food'],
  rollover: false,
  alerts: true,
  ...overrides,
});

describe('BudgetsStore', () => {
  const monthStartDay = signal(1);
  const weekStartDay = signal(1);
  let cash: string;
  let coffee: string;

  const spend = (overrides: Partial<NewTransaction>) =>
    TestBed.inject(TransactionsRepo).add({
      type: 'expense',
      amount: 1000,
      currency: 'USD',
      accountId: cash,
      categoryId: 'exp_food',
      date: '2026-09-20',
      tags: [],
      ...overrides,
    });

  /** The store with its listeners running. */
  function budgets() {
    const store = TestBed.inject(BudgetsStore);
    TestBed.tick();
    return store;
  }

  const at = (month: number, day: number) => vi.setSystemTime(new Date(2026, month - 1, day, 10));

  beforeEach(() => {
    localStorage.clear();
    monthStartDay.set(1);
    weekStartDay.set(1);
    vi.useFakeTimers({ toFake: ['Date'] });
    at(9, 26);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Preferences,
          useValue: {
            locale: signal('en-US'),
            baseCurrency: signal('USD'),
            monthStartDay,
            weekStartDay,
          },
        },
      ],
    });
    const categories = TestBed.inject(CategoriesStore);
    categories.seedDefaults();
    coffee = categories.create('expense', {
      name: 'Coffee',
      parentId: 'exp_food',
      icon: 'local_cafe',
      color: '#B45309',
    });
    cash = TestBed.inject(AccountsStore).create({
      name: 'Cash',
      type: 'cash',
      openingBalance: 0,
      creditLimit: null,
      includeInTotal: true,
    });
  });

  afterEach(() => vi.useRealTimers());

  it('writes a budget with the §8 fields, alerts at 80% and 100% (BUD-01)', async () => {
    const store = budgets();
    const id = store.create(input({ name: '  Food  ' }));

    const db = TestBed.inject(LocalDb);
    const [doc] = await db.get(`${db.userPath}/budgets`);
    expect(doc.id).toBe(id);
    expect(Object.keys(doc.data).sort()).toEqual([
      'active',
      'alertThresholds',
      'amount',
      'categoryIds',
      'createdAt',
      'lastAlert',
      'name',
      'period',
      'rollover',
      'updatedAt',
    ]);
    expect(store.byId(id)).toMatchObject({
      name: 'Food',
      amount: 50000,
      period: 'monthly',
      categoryIds: ['exp_food'],
      rollover: false,
      alertThresholds: [80, 100],
      lastAlert: null,
      active: true,
    });
    const quiet = store.create(input({ name: 'Quiet', alerts: false }));
    expect(store.byId(quiet)!.alertThresholds).toEqual([]);
  });

  it("sums this period's expenses in the categories and their subcategories (BUD-02, BUD-04)", () => {
    spend({ amount: 30000, date: '2026-09-02' });
    spend({ amount: 8000, date: '2026-09-10', categoryId: coffee });
    spend({ amount: 5000, date: '2026-09-26' });
    // None of these count: another category, last month, income, a transfer, an adjustment.
    spend({ amount: 700, categoryId: 'exp_transport' });
    spend({ amount: 900, date: '2026-08-31' });
    spend({ type: 'income', amount: 5000, categoryId: 'inc_salary' });
    spend({ type: 'transfer', amount: 5000, categoryId: null, toAccountId: cash });
    spend({ amount: 2000, categoryId: 'exp_adjustment' });

    const store = budgets();
    const id = store.create(input());
    TestBed.tick();

    expect(store.progressOf(store.byId(id)!)).toEqual({
      range: { start: '2026-09-01', end: '2026-09-30' },
      spent: 43000,
      limit: 50000,
      carry: 0,
      remaining: 7000,
      percent: 86,
      state: 'warning',
      daysLeft: 5,
      safePerDay: 1400,
    });
  });

  it('counts every expense when the budget names no category', () => {
    spend({ amount: 700, categoryId: 'exp_transport' });
    spend({ amount: 300 });
    const store = budgets();
    const id = store.create(input({ name: 'Everything', categoryIds: [] }));
    TestBed.tick();

    expect(store.progressOf(store.byId(id)!)?.spent).toBe(1000);
  });

  it('reads one range covering every active budget (NFR-19)', () => {
    const watchRange = vi.spyOn(TestBed.inject(TransactionsRepo), 'watchRange');
    const store = budgets();
    store.create(input({ period: 'weekly' }));
    store.create(input({ name: 'Year', period: 'yearly', categoryIds: [] }));
    TestBed.tick();

    expect(watchRange).toHaveBeenLastCalledWith({ start: '2026-01-01', end: '2026-12-31' });
    expect(store.progress().size).toBe(2);
  });

  it('follows the month and week start days (BR-05, BUD-08)', () => {
    monthStartDay.set(25);
    weekStartDay.set(7);
    const store = budgets();
    const monthly = store.create(input());
    const weekly = store.create(input({ period: 'weekly' }));
    const yearly = store.create(input({ period: 'yearly' }));
    TestBed.tick();

    const range = (id: string) => store.progressOf(store.byId(id)!)?.range;
    expect(range(monthly)).toEqual({ start: '2026-09-25', end: '2026-10-24' });
    expect(range(weekly)).toEqual({ start: '2026-09-20', end: '2026-09-26' });
    expect(range(yearly)).toEqual({ start: '2025-12-25', end: '2026-12-24' });
  });

  it("rolls last period's leftover into this one (BUD-07)", () => {
    at(7, 1);
    const id = TestBed.inject(BudgetsRepo).create({
      name: 'Food',
      amount: 50000,
      period: 'monthly',
      categoryIds: ['exp_food'],
      rollover: true,
      alertThresholds: [80, 100],
      active: true,
    });
    at(9, 26);
    spend({ amount: 35000, date: '2026-08-10' });
    spend({ amount: 10000, date: '2026-09-10' });
    const store = budgets();

    expect(store.progressOf(store.byId(id)!)).toMatchObject({
      carry: 15000,
      limit: 65000,
      remaining: 55000,
    });
  });

  it('saves only what changed, keeping thresholds another app set', () => {
    const store = budgets();
    const id = store.create(input());
    const repo = TestBed.inject(BudgetsRepo);
    repo.update(id, { alertThresholds: [50, 90] });
    const update = vi.spyOn(repo, 'update');

    store.update(store.byId(id)!, input({ amount: 60000 }));
    expect(update).toHaveBeenLastCalledWith(id, { amount: 60000 });
    expect(store.byId(id)!.alertThresholds).toEqual([50, 90]);

    store.update(store.byId(id)!, input({ amount: 60000 }));
    expect(update).toHaveBeenCalledTimes(1);

    store.update(store.byId(id)!, input({ amount: 60000, alerts: false }));
    expect(store.byId(id)!.alertThresholds).toEqual([]);
    const both = ['exp_food', coffee];
    store.update(store.byId(id)!, input({ amount: 60000, alerts: false, categoryIds: both }));
    expect(update).toHaveBeenLastCalledWith(id, { categoryIds: both });

    // Turning alerts back on starts from the defaults.
    store.update(store.byId(id)!, input({ amount: 60000, categoryIds: both }));
    expect(update).toHaveBeenLastCalledWith(id, { alertThresholds: [80, 100] });
  });

  it('pauses and resumes; paused budgets have no progress', () => {
    const store = budgets();
    const id = store.create(input());
    TestBed.tick();
    store.setActive(store.byId(id)!, false);
    TestBed.tick();

    expect(store.paused().map((b) => b.id)).toEqual([id]);
    expect(store.active()).toEqual([]);
    expect(store.progress().size).toBe(0);

    store.setActive(store.byId(id)!, true);
    TestBed.tick();
    expect(store.progressOf(store.byId(id)!)).toBeDefined();
  });

  it('puts a deleted budget back as it was (Undo)', () => {
    const store = budgets();
    const id = store.create(input());
    TestBed.inject(BudgetsRepo).recordAlert(id, { periodStart: '2026-09-01', threshold: 80 });
    const before = store.byId(id)!;

    store.delete(before);
    expect(store.all()).toEqual([]);
    store.restore(before);
    expect(store.byId(id)).toMatchObject({
      name: 'Food',
      lastAlert: { periodStart: '2026-09-01', threshold: 80 },
    });
  });

  it('lists budgets for every expense first, then by name', () => {
    const store = budgets();
    store.create(input({ name: 'Transport', categoryIds: ['exp_transport'] }));
    store.create(input({ name: 'Monthly spending', categoryIds: [] }));
    store.create(input({ name: 'Coffee', categoryIds: [coffee] }));
    expect(store.all().map((b) => b.name)).toEqual(['Monthly spending', 'Coffee', 'Transport']);
  });

  it('describes what a budget counts and picks its icon', () => {
    const store = budgets();
    const all = store.byId(store.create(input({ categoryIds: [] })))!;
    const one = store.byId(store.create(input({ categoryIds: [coffee] })))!;
    const two = store.byId(store.create(input({ categoryIds: ['exp_food', 'exp_transport'] })))!;

    expect(store.scopeOf(all)).toBe('All expenses');
    expect(store.scopeOf(one)).toBe('Food and dining › Coffee');
    expect(store.scopeOf(two)).toBe('Food and dining, Transport');
    expect(store.iconOf(one)).toEqual({ icon: 'local_cafe', color: '#B45309' });
    expect(store.iconOf(two).icon).toBe('donut_large');
  });

  it('moves on to a new period when the app comes back into view on a later day', () => {
    const store = budgets();
    const id = store.create(input());
    TestBed.tick();
    at(10, 2);
    document.dispatchEvent(new Event('visibilitychange'));
    TestBed.tick();

    expect(store.today()).toBe('2026-10-02');
    expect(store.progressOf(store.byId(id)!)?.range.start).toBe('2026-10-01');
  });
});
