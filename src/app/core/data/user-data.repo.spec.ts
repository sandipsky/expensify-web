import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { NewTransaction } from '../models/transaction';
import { Preferences } from '../preferences';
import { AccountsRepo, NewAccount } from './accounts.repo';
import { BudgetsRepo } from './budgets.repo';
import { LocalBucket } from './local-bucket';
import { LocalDb } from './local-db';
import { TransactionsRepo } from './transactions.repo';
import { UserDataRepo } from './user-data.repo';

const newAccount = (overrides: Partial<NewAccount> = {}): NewAccount => ({
  name: 'Cash',
  type: 'cash',
  currency: 'USD',
  openingBalance: 5000,
  creditLimit: null,
  icon: 'payments',
  color: '#36B37E',
  includeInTotal: true,
  archived: false,
  sortOrder: 0,
  ...overrides,
});

const tx = (overrides: Partial<NewTransaction>): NewTransaction => ({
  type: 'expense',
  amount: 1000,
  currency: 'USD',
  accountId: '',
  categoryId: 'exp_food',
  date: '2026-09-26',
  tags: [],
  ...overrides,
});

describe('UserDataRepo (SET-01, SET-04)', () => {
  let repo: UserDataRepo;
  let accounts: AccountsRepo;
  let transactions: TransactionsRepo;
  let cash: string;
  let bank: string;

  const balances = async () =>
    Object.fromEntries(
      (await firstValueFrom(accounts.watchAll())).map((a) => [a.name, a.currentBalance]),
    );

  beforeEach(() => {
    localStorage.clear();
    repo = TestBed.inject(UserDataRepo);
    accounts = TestBed.inject(AccountsRepo);
    transactions = TestBed.inject(TransactionsRepo);
    cash = accounts.create(newAccount());
    bank = accounts.create(newAccount({ name: 'Bank', openingBalance: 100_000, sortOrder: 1 }));
    transactions.add(tx({ accountId: cash, amount: 1250 }));
    transactions.add(tx({ type: 'income', accountId: bank, amount: 300_000, categoryId: null }));
    transactions.add(
      tx({
        type: 'transfer',
        accountId: bank,
        toAccountId: cash,
        amount: 20_000,
        categoryId: null,
      }),
    );
  });

  it('counts the transactions', async () => {
    expect(await repo.countTransactions()).toBe(3);
  });

  it('deletes every transaction and puts each balance back to its opening balance', async () => {
    const receipts = TestBed.inject(LocalBucket);
    const path = 'users/local/receipts/t1/a.jpg';
    await receipts.upload(path, new Blob(['x'], { type: 'image/jpeg' }), 'image/jpeg');
    transactions.add(
      tx({
        accountId: cash,
        attachments: [{ path, name: 'a.jpg', contentType: 'image/jpeg', size: 1 }],
      }),
      't1',
    );
    TestBed.inject(BudgetsRepo).create({
      name: 'Food',
      amount: 5000,
      period: 'monthly',
      categoryIds: [],
      rollover: false,
      alertThresholds: [80, 100],
      active: true,
    });
    expect(await balances()).toEqual({ Cash: 22_750, Bank: 380_000 });

    expect(await repo.deleteAllTransactions()).toBe(true);
    expect(await repo.countTransactions()).toBe(0);
    expect(await balances()).toEqual({ Cash: 5000, Bank: 100_000 });
    expect(await firstValueFrom(TestBed.inject(BudgetsRepo).watchAll())).toHaveLength(1);
    await vi.waitFor(async () => expect(await receipts.list('users/local/receipts')).toEqual([]));
  });

  it('relabels accounts and transactions with a new currency, amounts unchanged', async () => {
    expect(await repo.relabelCurrency('EUR')).toBe(true);
    const docs = await TestBed.inject(LocalDb).get('users/local/transactions');
    expect(docs.map((d) => d.data['currency'])).toEqual(['EUR', 'EUR', 'EUR']);
    const all = await firstValueFrom(accounts.watchAll());
    expect(all.map((a) => a.currency)).toEqual(['EUR', 'EUR']);
    expect(await balances()).toEqual({ Cash: 23_750, Bank: 380_000 });
  });

  it('deletes the whole account, receipts included, and the profile last', async () => {
    TestBed.inject(Preferences).save({ baseCurrency: 'USD', theme: 'dark' });
    const bucket = TestBed.inject(LocalBucket);
    await bucket.upload('users/local/receipts/t9/b.pdf', new Blob(['x']), 'application/pdf');

    expect(await repo.deleteAll()).toBe(true);
    const db = TestBed.inject(LocalDb);
    for (const name of ['accounts', 'transactions', 'budgets', 'categories']) {
      expect(await db.get(`users/local/${name}`)).toEqual([]);
    }
    expect(await db.get('users')).toEqual([]);
    expect(await bucket.list('users/local/receipts')).toEqual([]);
    expect(TestBed.inject(Preferences).baseCurrency()).toBe('NPR');
  });

  it('keeps the profile when a batch fails, so deleting can run again', async () => {
    TestBed.inject(Preferences).save({ theme: 'dark' });
    const db = TestBed.inject(LocalDb);
    const batch = db.batch.bind(db);
    vi.spyOn(db, 'batch').mockImplementationOnce(() => {
      const failing = batch();
      failing.commit = () => Promise.reject(new Error('offline'));
      return failing;
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await repo.deleteAll()).toBe(false);
    expect(TestBed.inject(Preferences).theme()).toBe('dark');
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
