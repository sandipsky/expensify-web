import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NO_FILTER } from '../../core/domain/transactions';
import { NewTransaction } from '../../core/models/transaction';
import { Preferences } from '../../core/preferences';
import { AccountsStore } from '../accounts/accounts.store';
import { CategoriesStore } from '../categories/categories.store';
import { PAGE_SIZE, TransactionListStore } from './transaction-list.store';
import { TransactionsStore } from './transactions.store';

const account = { openingBalance: 0, creditLimit: null, includeInTotal: true };

describe('TransactionListStore', () => {
  const monthStartDay = signal(1);
  let cash: string;
  let bank: string;
  let store: TransactionsStore;

  const add = (overrides: Partial<NewTransaction>) =>
    store.add({
      type: 'expense',
      amount: 1000,
      currency: 'USD',
      accountId: cash,
      categoryId: 'exp_food',
      date: '2026-09-20',
      tags: [],
      ...overrides,
    });

  beforeEach(() => {
    localStorage.clear();
    monthStartDay.set(1);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 27, 10, 0));
    TestBed.configureTestingModule({
      providers: [
        TransactionListStore,
        {
          provide: Preferences,
          useValue: { locale: signal('en-US'), baseCurrency: signal('USD'), monthStartDay },
        },
      ],
    });
    const accounts = TestBed.inject(AccountsStore);
    cash = accounts.create({ ...account, name: 'Cash', type: 'cash' });
    bank = accounts.create({ ...account, name: 'Bank', type: 'bank' });
    TestBed.inject(CategoriesStore).seedDefaults();
    store = TestBed.inject(TransactionsStore);
  });

  afterEach(() => vi.useRealTimers());

  /** The list store with its listener running. */
  function list() {
    const list = TestBed.inject(TransactionListStore);
    TestBed.tick();
    return list;
  }

  it("lists this month's entries newest first, grouped by day with each day's net (LST-01)", () => {
    add({ date: '2026-09-20', time: '09:00', amount: 500 });
    add({ date: '2026-09-26', amount: 700 });
    add({
      date: '2026-09-20',
      time: '18:30',
      type: 'income',
      categoryId: 'inc_salary',
      amount: 2000,
    });
    add({ date: '2026-08-31' });
    const l = list();

    expect(l.range()).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(l.visible().map((t) => [t.date, t.time ?? null])).toEqual([
      ['2026-09-26', null],
      ['2026-09-20', '18:30'],
      ['2026-09-20', '09:00'],
    ]);
    expect(l.days().map((d) => [d.label, d.net])).toEqual([
      ['Yesterday · Sat, Sep 26, 2026', -700],
      ['Sun, Sep 20, 2026', 1500],
    ]);
  });

  it('switches between this month, last month, this year and a custom range (LST-02)', () => {
    add({ date: '2026-08-15' });
    add({ date: '2026-02-01' });
    const l = list();
    expect(l.visible()).toHaveLength(0);

    l.setPreset('last_month');
    TestBed.tick();
    expect(l.visible().map((t) => t.date)).toEqual(['2026-08-15']);

    l.setPreset('this_year');
    TestBed.tick();
    expect(l.visible()).toHaveLength(2);

    l.setCustom({ start: '2026-01-15', end: '2026-02-15' });
    TestBed.tick();
    expect(l.preset()).toBe('custom');
    expect(l.visible().map((t) => t.date)).toEqual(['2026-02-01']);
  });

  it('follows the month start day (BR-05)', () => {
    monthStartDay.set(25);
    add({ date: '2026-09-24' });
    add({ date: '2026-10-24' });
    const l = list();
    expect(l.range()).toEqual({ start: '2026-09-25', end: '2026-10-24' });
    expect(l.visible().map((t) => t.date)).toEqual(['2026-10-24']);
  });

  it('totals what is shown, leaving transfers and adjustments out (LST-03, TXN-09, BR-12)', () => {
    add({ amount: 1250 });
    add({ type: 'income', categoryId: 'inc_salary', amount: 300000 });
    add({ type: 'transfer', categoryId: null, toAccountId: bank, amount: 20000 });
    add({ type: 'income', categoryId: 'inc_adjustment', amount: 99 });
    const l = list();
    expect(l.totals()).toEqual({ income: 300000, expense: 1250, net: 298750 });

    l.setFilter({ ...NO_FILTER, type: 'expense' });
    expect(l.totals()).toEqual({ income: 0, expense: 1250, net: -1250 });
  });

  it('combines filters with the search, which survives a filter change (LST-02, LST-06)', () => {
    add({ payee: 'Fresh Mart', categoryId: 'exp_groceries', tags: ['home'] });
    add({ payee: 'Fresh Mart', accountId: bank, categoryId: 'exp_groceries' });
    add({ payee: 'City bus', categoryId: 'exp_transport' });
    const l = list();

    l.setSearch('fresh');
    expect(l.visible()).toHaveLength(2);
    l.setFilter({ ...NO_FILTER, accountIds: [cash] });
    expect(l.filter().search).toBe('fresh');
    expect(l.visible().map((t) => t.accountId)).toEqual([cash]);
    expect(l.filterCount()).toBe(1);
    expect(l.periodTags()).toEqual(['home']);

    l.clearFilters();
    expect(l.visible()).toHaveLength(3);
    expect(l.filtering()).toBe(false);
  });

  it('loads a period longer than a year in pages, whole days at a time (LST-04)', () => {
    for (let i = 0; i < PAGE_SIZE + 10; i++) {
      add({
        date: `2025-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
      });
    }
    const l = list();
    l.setCustom({ start: '2024-01-01', end: '2026-09-30' });
    TestBed.tick();

    expect(l.paged()).toBe(true);
    expect(l.hasMore()).toBe(true);
    expect(l.loaded().length).toBeLessThanOrEqual(PAGE_SIZE);
    const oldest = l.loaded()[l.loaded().length - 1].date;
    expect(l.loaded().filter((t) => t.date === oldest).length).toBeGreaterThan(0);

    l.loadMore();
    TestBed.tick();
    expect(l.hasMore()).toBe(false);
    expect(l.loaded()).toHaveLength(PAGE_SIZE + 10);
  });

  it('selects only what is shown, and clears the selection when done (TXN-13)', () => {
    const a = add({ payee: 'A' });
    const b = add({ payee: 'B' });
    const l = list();

    l.startSelecting();
    l.toggle(a);
    l.toggle(b);
    expect(l.selected()).toHaveLength(2);
    l.setSearch('A');
    expect(l.selected().map((t) => t.id)).toEqual([a]);
    l.setSearch('');
    expect(l.allSelected()).toBe(true);

    l.toggleAll();
    expect(l.selected()).toHaveLength(0);
    l.toggleAll();
    expect(l.selected()).toHaveLength(2);

    l.toggle(a);
    l.stopSelecting();
    expect(l.selecting()).toBe(false);
    expect(l.isSelected(a)).toBe(false);
  });
});
