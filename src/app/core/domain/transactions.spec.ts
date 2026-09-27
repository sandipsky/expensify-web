import { Transaction } from '../models/transaction';
import {
  NO_FILTER,
  activeFilterCount,
  compareNewestFirst,
  filterTransactions,
  groupByDay,
  isUpcoming,
  localDate,
  localTime,
  matchesSearch,
  normalizeTags,
  payeeSuggestions,
  recentCategoryIds,
  suggestCategory,
  tagSuggestions,
  toNewTransaction,
  totalsOf,
  transactionChanges,
  wholeDays,
  withAccount,
  withCategory,
} from './transactions';

const at = (ms: number) => ({ toMillis: () => ms });

let seq = 0;
const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: `t${++seq}`,
  type: 'expense',
  amount: 1000,
  currency: 'USD',
  accountId: 'cash',
  toAccountId: null,
  accountIds: overrides.toAccountId
    ? [overrides.accountId ?? 'cash', overrides.toAccountId]
    : [overrides.accountId ?? 'cash'],
  categoryId: 'exp_food',
  date: '2026-09-26',
  tags: [],
  source: 'web',
  createdAt: null,
  updatedAt: null,
  ...overrides,
});

describe('transactions', () => {
  describe('compareNewestFirst', () => {
    it('orders by date, then time, then creation, newest first', () => {
      const rows = [
        { id: 'a', date: '2026-09-25', time: '09:00', createdAt: at(1) },
        { id: 'b', date: '2026-09-26', time: null, createdAt: at(2) },
        { id: 'c', date: '2026-09-26', time: '08:00', createdAt: at(3) },
        { id: 'd', date: '2026-09-26', time: '08:00', createdAt: at(4) },
        { id: 'e', date: '2026-09-26', time: '14:30', createdAt: at(5) },
      ];
      expect([...rows].sort(compareNewestFirst).map((r) => r.id)).toEqual([
        'e',
        'd',
        'c',
        'b',
        'a',
      ]);
    });

    it('puts entries the server has not timestamped yet first', () => {
      const confirmed = { date: '2026-09-26', time: '10:00', createdAt: at(10) };
      const pending = { date: '2026-09-26', time: '10:00', createdAt: null };
      expect(compareNewestFirst(pending, confirmed)).toBeLessThan(0);
      expect(compareNewestFirst(pending, pending)).toBe(0);
    });
  });

  it('formats the local calendar date and time (BR-06)', () => {
    const now = new Date(2026, 8, 5, 7, 4);
    expect(localDate(now)).toBe('2026-09-05');
    expect(localTime(now)).toBe('07:04');
  });

  it('labels only dates after today as upcoming (TXN-14)', () => {
    expect(isUpcoming({ date: '2026-09-28' }, '2026-09-27')).toBe(true);
    expect(isUpcoming({ date: '2026-09-27' }, '2026-09-27')).toBe(false);
  });

  it('normalizes tags to at most 10 lowercase, unique words (TXN-03)', () => {
    expect(normalizeTags([' Travel ', '#trip', 'travel', '', '##Work'])).toEqual([
      'travel',
      'trip',
      'work',
    ]);
    expect(normalizeTags(Array.from({ length: 12 }, (_, i) => `t${i}`))).toHaveLength(10);
  });

  describe('totalsOf', () => {
    it('leaves transfers out of income and expense (TXN-09, US-02)', () => {
      const totals = totalsOf([
        tx({ type: 'income', amount: 300000, categoryId: 'inc_salary' }),
        tx({ type: 'expense', amount: 1250 }),
        tx({ type: 'transfer', amount: 20000, toAccountId: 'bank', categoryId: null }),
      ]);
      expect(totals).toEqual({ income: 300000, expense: 1250, net: 298750 });
    });

    it('leaves balance adjustments out (BR-12)', () => {
      const totals = totalsOf([
        tx({ type: 'income', amount: 500, categoryId: 'inc_adjustment' }),
        tx({ type: 'expense', amount: 700, categoryId: 'exp_adjustment' }),
        tx({ type: 'expense', amount: 100 }),
      ]);
      expect(totals).toEqual({ income: 0, expense: 100, net: -100 });
    });
  });

  it('groups newest-first entries into days (LST-01)', () => {
    const days = groupByDay([
      { id: 'a', date: '2026-09-26' },
      { id: 'b', date: '2026-09-26' },
      { id: 'c', date: '2026-09-24' },
    ]);
    expect(days.map((d) => [d.date, d.items.map((i) => i.id)])).toEqual([
      ['2026-09-26', ['a', 'b']],
      ['2026-09-24', ['c']],
    ]);
  });

  it('holds back a possibly cut-short oldest day while more pages remain (LST-04)', () => {
    const page = [{ date: '2026-09-26' }, { date: '2026-09-25' }, { date: '2026-09-25' }];
    expect(wholeDays(page, true)).toEqual([{ date: '2026-09-26' }]);
    expect(wholeDays(page, false)).toHaveLength(3);
    const oneDay = [{ date: '2026-09-25' }, { date: '2026-09-25' }];
    expect(wholeDays(oneDay, true)).toHaveLength(2);
  });

  describe('filterTransactions (LST-02, LST-07)', () => {
    const categories = new Map([
      ['exp_food', { parentId: null }],
      ['coffee', { parentId: 'exp_food' }],
      ['exp_transport', { parentId: null }],
    ]);
    const food = tx({ payee: 'Corner Deli', tags: ['lunch'], amount: 1500 });
    const coffee = tx({ categoryId: 'coffee', note: 'Flat white', amount: 450 });
    const bus = tx({ categoryId: 'exp_transport', accountId: 'bank', amount: 300 });
    const salary = tx({ type: 'income', categoryId: 'inc_salary', accountId: 'bank' });
    const move = tx({ type: 'transfer', categoryId: null, accountId: 'bank', toAccountId: 'cash' });
    const all = [food, coffee, bus, salary, move];
    const ids = (filter: Partial<typeof NO_FILTER>) =>
      filterTransactions(all, { ...NO_FILTER, ...filter }, categories).map((t) => t.id);

    it('passes everything without a filter', () => {
      expect(ids({})).toEqual(all.map((t) => t.id));
      expect(activeFilterCount(NO_FILTER)).toBe(0);
    });

    it('filters by type', () => {
      expect(ids({ type: 'income' })).toEqual([salary.id]);
    });

    it('matches accounts on either side of a transfer', () => {
      expect(ids({ accountIds: ['cash'] })).toEqual([food.id, coffee.id, move.id]);
    });

    it('brings subcategories with their parent (CAT-07)', () => {
      expect(ids({ categoryIds: ['exp_food'] })).toEqual([food.id, coffee.id]);
      expect(ids({ categoryIds: ['coffee'] })).toEqual([coffee.id]);
    });

    it('filters by tag and inclusive amount range', () => {
      expect(ids({ tags: ['lunch'] })).toEqual([food.id]);
      expect(ids({ minAmount: 450, maxAmount: 1000 })).toEqual([coffee.id, salary.id, move.id]);
    });

    it('combines filters (LST-02)', () => {
      const filter = { type: 'expense' as const, accountIds: ['cash'], minAmount: 1000 };
      expect(ids(filter)).toEqual([food.id]);
      expect(activeFilterCount({ ...NO_FILTER, ...filter })).toBe(3);
    });

    it('searches payee, note and tags within the result (LST-06)', () => {
      expect(ids({ search: 'deli' })).toEqual([food.id]);
      expect(ids({ search: 'WHITE' })).toEqual([coffee.id]);
      expect(ids({ search: '#lunch corner' })).toEqual([food.id]);
      expect(ids({ search: 'deli white' })).toEqual([]);
    });
  });

  it('matches every search word somewhere in the entry', () => {
    const entry = { payee: 'Fresh Mart', note: 'weekly shop', tags: ['groceries'] };
    expect(matchesSearch(entry, '  ')).toBe(true);
    expect(matchesSearch(entry, 'mart groc')).toBe(true);
    expect(matchesSearch(entry, 'mart bakery')).toBe(false);
  });

  describe('suggestions from past entries', () => {
    const history = [
      tx({ payee: 'Fresh Mart', categoryId: 'exp_groceries', tags: ['home'] }),
      tx({ payee: 'fresh mart', categoryId: 'exp_food', tags: ['home', 'weekly'] }),
      tx({ payee: 'Bus pass', categoryId: 'exp_transport' }),
      tx({ type: 'income', payee: 'Fresh Mart', categoryId: 'inc_refunds' }),
      tx({ payee: 'Bank', categoryId: 'exp_adjustment' }),
    ];

    it('offers distinct payees and tags, most recent first (TXN-12)', () => {
      expect(payeeSuggestions(history)).toEqual(['Fresh Mart', 'Bus pass', 'Bank']);
      expect(tagSuggestions(history)).toEqual(['home', 'weekly']);
    });

    it("suggests the payee's last category for the type, ignoring case (TXN-15)", () => {
      expect(suggestCategory(history, 'FRESH MART ', 'expense')).toBe('exp_groceries');
      expect(suggestCategory(history, 'Fresh Mart', 'income')).toBe('inc_refunds');
      expect(suggestCategory(history, 'Bank', 'expense')).toBeNull();
      expect(suggestCategory(history, '', 'expense')).toBeNull();
    });

    it('lists recently used categories of a type first', () => {
      expect(recentCategoryIds(history, 'expense')).toEqual([
        'exp_groceries',
        'exp_food',
        'exp_transport',
      ]);
    });
  });

  describe('edits (TXN-06)', () => {
    it('reports only the fields that change, treating missing and null alike', () => {
      const before = tx({ payee: undefined, tags: ['a'] });
      const same = { ...toNewTransaction(before), payee: null };
      expect(transactionChanges(before, same)).toEqual({});
      expect(transactionChanges(before, { ...same, amount: 4500, tags: ['a', 'b'] })).toEqual({
        amount: 4500,
        tags: ['a', 'b'],
      });
    });

    it('rewrites accountIds when either account changes', () => {
      const before = tx();
      const after = { ...toNewTransaction(before), type: 'transfer' as const, toAccountId: 'bank' };
      expect(transactionChanges(before, after)).toMatchObject({
        type: 'transfer',
        toAccountId: 'bank',
        accountIds: ['cash', 'bank'],
      });
    });
  });

  describe('bulk changes (TXN-13)', () => {
    it('recategorizes only entries of the category type', () => {
      const food = { id: 'exp_food', type: 'expense' as const };
      const shopping = { id: 'exp_shopping', type: 'expense' as const };
      expect(withCategory(tx(), shopping)?.categoryId).toBe('exp_shopping');
      expect(withCategory(tx(), food)).toBeNull();
      expect(withCategory(tx({ type: 'income', categoryId: 'inc_salary' }), shopping)).toBeNull();
      expect(withCategory(tx({ type: 'transfer', categoryId: null }), shopping)).toBeNull();
    });

    it('moves entries to another account, except a transfer into it', () => {
      expect(withAccount(tx(), 'bank')?.accountId).toBe('bank');
      expect(withAccount(tx(), 'cash')).toBeNull();
      const transfer = tx({ type: 'transfer', categoryId: null, toAccountId: 'bank' });
      expect(withAccount(transfer, 'bank')).toBeNull();
      expect(withAccount(transfer, 'card')).toMatchObject({
        accountId: 'card',
        toAccountId: 'bank',
      });
    });
  });
});
