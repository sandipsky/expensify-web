import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AccountsRepo } from '../../core/data/accounts.repo';
import { LocalDb } from '../../core/data/local-db';
import { TransactionsRepo } from '../../core/data/transactions.repo';
import { AccountInput } from '../../core/models/account';
import { Preferences } from '../../core/preferences';
import { AccountsStore } from './accounts.store';

const input = (overrides: Partial<AccountInput> = {}): AccountInput => ({
  name: 'Cash',
  type: 'cash',
  openingBalance: 5000,
  creditLimit: null,
  includeInTotal: true,
  ...overrides,
});

describe('AccountsStore', () => {
  let store: AccountsStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Preferences,
          useValue: { locale: signal('en-US'), baseCurrency: signal('NPR') },
        },
      ],
    });
    store = TestBed.inject(AccountsStore);
  });

  afterEach(() => vi.useRealTimers());

  it("adds accounts in the base currency with the type's icon and color, at the end (ACC-01)", () => {
    store.create(input({ name: '  Wallet ' }));
    store.create(
      input({ name: 'Card', type: 'credit_card', openingBalance: -20000, creditLimit: 100000 }),
    );

    const [wallet, card] = store.all();
    expect(wallet).toMatchObject({
      name: 'Wallet',
      currency: 'NPR',
      icon: 'payments',
      color: '#36B37E',
      sortOrder: 0,
      currentBalance: 5000,
    });
    expect(card).toMatchObject({
      icon: 'credit_card',
      sortOrder: 1,
      creditLimit: 100000,
      currentBalance: -20000,
    });
  });

  it('keeps a credit limit on credit cards only (ACC-08)', () => {
    store.create(input({ type: 'loan', creditLimit: 5000 }));
    expect(store.all()[0].creditLimit).toBeNull();
  });

  it('totals active accounts marked "include in total" and hides archived ones (ACC-02, ACC-04)', () => {
    store.create(input({ name: 'Cash', openingBalance: 5000 }));
    store.create(input({ name: 'Card', type: 'credit_card', openingBalance: -2000 }));
    store.create(input({ name: 'Savings', openingBalance: 90000, includeInTotal: false }));
    const old = store.byId(store.create(input({ name: 'Old', openingBalance: 700 })))!;
    store.setArchived(old, true);

    expect(store.total()).toBe(3000);
    expect(store.active().map((a) => a.name)).toEqual(['Cash', 'Card', 'Savings']);
    expect(store.archived().map((a) => a.name)).toEqual(['Old']);
    expect(store.excludedCount()).toBe(1);
  });

  it('shifts the current balance when the opening balance changes (ACC-03)', () => {
    const id = store.create(input({ openingBalance: 5000 }));
    TestBed.inject(TransactionsRepo).add({
      type: 'expense',
      amount: 1000,
      currency: 'NPR',
      accountId: id,
      categoryId: 'exp_food',
      date: '2026-09-26',
      tags: [],
    });
    store.update(store.byId(id)!, input({ openingBalance: 7500 }));
    expect(store.byId(id)).toMatchObject({ openingBalance: 7500, currentBalance: 6500 });
  });

  it('writes only the fields that changed', () => {
    const id = store.create(input());
    const update = vi.spyOn(TestBed.inject(AccountsRepo), 'update');

    store.update(store.byId(id)!, input({ name: ' Cash ' }));
    expect(update).not.toHaveBeenCalled();

    store.update(store.byId(id)!, input({ includeInTotal: false }));
    expect(update).toHaveBeenCalledWith(expect.anything(), { includeInTotal: false });
  });

  it('moves the icon and color to a new type only while they are the defaults', () => {
    const id = store.create(input());
    store.update(store.byId(id)!, input({ type: 'bank' }));
    expect(store.byId(id)).toMatchObject({ icon: 'account_balance', color: '#2456E6' });

    // A custom icon, as the Android app might set.
    TestBed.inject(AccountsRepo).update(store.byId(id)!, { icon: 'savings' });
    store.update(store.byId(id)!, input({ type: 'wallet' }));
    expect(store.byId(id)).toMatchObject({ icon: 'savings', color: '#00B8D9' });
  });

  it('records a balance adjustment dated now for the difference (ACC-07)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 26, 14, 30));
    const id = store.create(input({ type: 'bank', openingBalance: 10000 }));

    expect(store.reconcile(store.byId(id)!, 12550)).toEqual({
      type: 'income',
      amount: 2550,
      categoryId: 'inc_adjustment',
    });
    expect(store.byId(id)!.currentBalance).toBe(12550);

    const [tx] = await TestBed.inject(TransactionsRepo).listByAccount(id);
    expect(tx).toMatchObject({
      type: 'income',
      amount: 2550,
      currency: 'NPR',
      categoryId: 'inc_adjustment',
      date: '2026-09-26',
      time: '14:30',
      accountIds: [id],
      source: 'web',
    });

    expect(store.reconcile(store.byId(id)!, 12550)).toBeNull();
    expect(await TestBed.inject(TransactionsRepo).listByAccount(id)).toHaveLength(1);
  });

  it('counts and deletes an account with its transactions (ACC-05)', async () => {
    const id = store.create(input({ type: 'bank', openingBalance: 10000 }));
    store.reconcile(store.byId(id)!, 9000);
    const account = store.byId(id)!;
    expect(await store.transactionCount(account)).toBe(1);

    await store.delete(account);
    expect(store.all()).toEqual([]);
    expect(await TestBed.inject(LocalDb).get('users/local/transactions')).toEqual([]);

    store.restore(account);
    expect(store.byId(id)?.name).toBe('Cash');
  });

  it("streams an account's transactions newest first within a day (ACC-06)", async () => {
    const id = store.create(input());
    const transactions = TestBed.inject(TransactionsRepo);
    const base = { currency: 'NPR', accountId: id, categoryId: 'exp_food', tags: [] };
    transactions.add({ ...base, type: 'expense', amount: 100, date: '2026-09-26', time: '09:00' });
    transactions.add({ ...base, type: 'expense', amount: 200, date: '2026-09-26', time: '18:00' });
    transactions.add({ ...base, type: 'expense', amount: 300, date: '2026-09-25', time: '23:00' });

    const txs = await firstValueFrom(store.watchTransactions(id, 50));
    expect(txs.map((t) => t.amount)).toEqual([200, 100, 300]);
  });
});
