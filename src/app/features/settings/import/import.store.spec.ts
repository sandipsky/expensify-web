import { TestBed } from '@angular/core/testing';
import { TransactionsRepo } from '../../../core/data/transactions.repo';
import { Preferences } from '../../../core/preferences';
import { AccountsStore } from '../../accounts/accounts.store';
import { CategoriesStore } from '../../categories/categories.store';
import { ImportStore, preferredDateOrder } from './import.store';

const csv = (lines: string[]) =>
  new File(['﻿' + lines.join('\r\n')], 'export.csv', { type: 'text/csv' });

const APP_EXPORT = [
  'Date,Time,Type,Amount,Currency,Account,To account,Category,Subcategory,Payee,Note,Tags',
  '2026-09-25,09:00,income,3000.00,USD,Bank,,Salary,,Employer Ltd,September salary,',
  '2026-09-25,13:10,expense,12.50,USD,Cash,,Food and dining,Lunch,"Corner Cafe, Main St",,work',
  '2026-09-26,,transfer,200.00,USD,Bank,Cash,,,,ATM withdrawal,',
  '2026-09-27,,expense,4.00,USD,Cash,,Pets,,Pet shop,,',
  'soon,,expense,1.00,USD,Cash,,,,Broken,,',
];

describe('ImportStore (DAT-02)', () => {
  let store: ImportStore;
  let cash: string;
  let bank: string;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [ImportStore] });
    TestBed.inject(Preferences).save({ baseCurrency: 'USD' });
    const accounts = TestBed.inject(AccountsStore);
    const base = { openingBalance: 0, creditLimit: null, includeInTotal: true };
    cash = accounts.create({ ...base, name: 'Cash', type: 'cash' });
    bank = accounts.create({ ...base, name: 'Bank', type: 'bank' });
    TestBed.inject(CategoriesStore).seedDefaults();
    store = TestBed.inject(ImportStore);
  });

  it('reads the file and maps an Expensify export by itself', async () => {
    expect(await store.load(csv(APP_EXPORT), 'export.csv')).toBeNull();
    expect(store.step()).toBe(1);
    expect(store.fileName()).toBe('export.csv');
    expect(store.dataRows()).toHaveLength(5);
    expect(store.dataRows()[1][9]).toBe('Corner Cafe, Main St');
    expect(store.gaps()).toEqual([]);
    expect(store.mapping()).toMatchObject({
      dateOrder: 'ymd',
      decimalSeparator: '.',
      amountMode: 'signed',
    });
    expect(store.columnItems()[0]).toEqual({ value: 0, label: 'Date · 2026-09-25' });
  });

  it('refuses a file without rows under its header', async () => {
    expect(await store.load(csv(['Date,Amount']), 'empty.csv')).toBe('empty');
    expect(store.step()).toBe(0);
  });

  it('lets a column fill one field at most', async () => {
    await store.load(csv(APP_EXPORT), 'export.csv');
    store.setColumn('note', 9);
    expect(store.mapping().columns.note).toBe(9);
    expect(store.mapping().columns.payee).toBeUndefined();
    store.setColumn('date', null);
    expect(store.gaps()).toEqual(['date']);
  });

  it('flags entries already logged, and imports the rest with new categories (§4)', async () => {
    const repo = TestBed.inject(TransactionsRepo);
    repo.add({
      type: 'income',
      amount: 300000,
      currency: 'USD',
      accountId: bank,
      categoryId: 'inc_salary',
      date: '2026-09-25',
      payee: 'employer ltd',
      tags: [],
    });
    await store.load(csv(APP_EXPORT), 'export.csv');
    await store.review();
    expect(store.step()).toBe(2);
    expect(store.counts()).toEqual({ total: 5, ready: 3, duplicates: 1, errors: 1, warnings: 0 });
    // Lunch goes under the existing Food and dining; Pets is new at the top level.
    expect(store.newCategories().map((c) => [c.name, c.parentId])).toEqual([
      ['Lunch', 'exp_food'],
      ['Pets', null],
    ]);

    const result = store.import();
    expect(result).toEqual({
      count: 3,
      categories: 2,
      range: { start: '2026-09-25', end: '2026-09-27' },
    });
    expect(store.step()).toBe(3);

    const all = await repo.listRange(null);
    expect(all).toHaveLength(4);
    const imported = all.filter((t) => t.source === 'import');
    expect(imported.map((t) => t.payee).sort()).toEqual(
      ['Corner Cafe, Main St', 'Pet shop', null].sort(),
    );
    const pets = TestBed.inject(CategoriesStore)
      .all()
      .find((c) => c.name === 'Pets')!;
    expect(imported.find((t) => t.payee === 'Pet shop')!.categoryId).toBe(pets.id);

    const accounts = TestBed.inject(AccountsStore);
    // Cash: −12.50 −4.00 +200 from the transfer. Bank: the salary logged before, −200.
    expect(accounts.byId(cash)!.currentBalance).toBe(-1250 - 400 + 20000);
    expect(accounts.byId(bank)!.currentBalance).toBe(300000 - 20000);
  });

  it('imports duplicates too when asked', async () => {
    TestBed.inject(TransactionsRepo).add({
      type: 'expense',
      amount: 400,
      currency: 'USD',
      accountId: cash,
      categoryId: 'exp_food',
      date: '2026-09-27',
      payee: 'Pet shop',
      tags: [],
    });
    await store.load(csv(APP_EXPORT), 'export.csv');
    await store.review();
    expect(store.counts().ready).toBe(3);
    store.skipDuplicates.set(false);
    expect(store.counts().ready).toBe(4);
  });

  it('reads ambiguous dates the way the locale writes them', () => {
    expect(preferredDateOrder('en-US')).toBe('mdy');
    expect(preferredDateOrder('en-GB')).toBe('dmy');
    expect(preferredDateOrder('sv-SE')).toBe('ymd');
  });
});
