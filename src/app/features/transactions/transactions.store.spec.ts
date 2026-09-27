import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { NewTransaction } from '../../core/models/transaction';
import { Preferences } from '../../core/preferences';
import { AccountsStore } from '../accounts/accounts.store';
import { TransactionsStore } from './transactions.store';

const account = { openingBalance: 0, creditLimit: null, includeInTotal: true };

describe('TransactionsStore', () => {
  let accounts: AccountsStore;
  let cash: string;
  let bank: string;

  const tx = (overrides: Partial<NewTransaction> = {}): NewTransaction => ({
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
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Preferences,
          useValue: { locale: signal('en-US'), baseCurrency: signal('USD') },
        },
      ],
    });
    accounts = TestBed.inject(AccountsStore);
    cash = accounts.create({ ...account, name: 'Cash', type: 'cash' });
    bank = accounts.create({ ...account, name: 'Bank', type: 'bank' });
  });

  it('starts new entries on the first active account, then on the last one used (TXN-04)', () => {
    const store = TestBed.inject(TransactionsStore);
    expect(store.defaultAccountId()).toBe(cash);
    store.add(tx({ accountId: bank }));
    expect(store.defaultAccountId()).toBe(bank);
    expect(localStorage.getItem('expensify.last-account')).toBe(bank);

    // Archived accounts leave pickers (ACC-04).
    accounts.setArchived(accounts.byId(bank)!, true);
    expect(store.defaultAccountId()).toBe(cash);
  });

  it('remembers the last account across sessions on this device', () => {
    localStorage.setItem('expensify.last-account', bank);
    expect(TestBed.inject(TransactionsStore).defaultAccountId()).toBe(bank);
  });

  it('recategorizes and moves only the entries that can take the change (TXN-13)', async () => {
    const store = TestBed.inject(TransactionsStore);
    store.add(tx());
    store.add(tx({ type: 'income', categoryId: 'inc_salary' }));
    store.add(tx({ type: 'transfer', categoryId: null, toAccountId: bank }));
    const all = await firstValueFrom(store.watchRecent());

    expect(store.recategorize(all, { id: 'exp_groceries', type: 'expense' })).toBe(1);
    expect(store.move(all, bank)).toBe(2);
    const after = await firstValueFrom(store.watchRecent());
    expect(after.map((t) => [t.type, t.accountId, t.categoryId]).sort()).toEqual(
      [
        ['expense', bank, 'exp_groceries'],
        ['income', bank, 'inc_salary'],
        ['transfer', cash, null],
      ].sort(),
    );
    // Cash: the expense moved off (+1000); Bank: took it, and gained the income.
    expect(accounts.byId(cash)!.currentBalance).toBe(-1000);
    expect(accounts.byId(bank)!.currentBalance).toBe(1000);
  });
});
