import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { NewTransaction } from '../models/transaction';
import { AccountsRepo } from './accounts.repo';
import { LocalDb } from './local-db';
import { TransactionsRepo } from './transactions.repo';

const expense = (accountId: string, date: string, amount = 1000): NewTransaction => ({
  type: 'expense',
  amount,
  currency: 'USD',
  accountId,
  categoryId: 'exp_food',
  date,
  tags: [],
});

describe('TransactionsRepo', () => {
  let repo: TransactionsRepo;
  let bank: string;
  let cash: string;

  const balances = async () =>
    Object.fromEntries(
      (await firstValueFrom(TestBed.inject(AccountsRepo).watchAll())).map((a) => [
        a.name,
        a.currentBalance,
      ]),
    );

  beforeEach(() => {
    localStorage.clear();
    repo = TestBed.inject(TransactionsRepo);
    const accounts = TestBed.inject(AccountsRepo);
    const base = { currency: 'USD', creditLimit: null, icon: 'x', color: '#000000' };
    bank = accounts.create({
      ...base,
      name: 'Bank',
      type: 'bank',
      openingBalance: 100000,
      includeInTotal: true,
      archived: false,
      sortOrder: 0,
    });
    cash = accounts.create({
      ...base,
      name: 'Cash',
      type: 'cash',
      openingBalance: 5000,
      includeInTotal: true,
      archived: false,
      sortOrder: 1,
    });
  });

  it('writes a transfer with accountIds, source and timestamps, and moves both balances (US-02)', async () => {
    const id = repo.add({
      type: 'transfer',
      amount: 20000,
      currency: 'USD',
      accountId: bank,
      toAccountId: cash,
      date: '2026-09-26',
      tags: [],
    });

    const stored = (await TestBed.inject(LocalDb).get('users/local/transactions'))[0];
    expect(stored.id).toBe(id);
    expect(stored.data).toMatchObject({ accountIds: [bank, cash], source: 'web' });
    expect(stored.data['createdAt']).toBeTruthy();
    expect(await balances()).toEqual({ Bank: 80000, Cash: 25000 });
  });

  it('takes an expense off its account', async () => {
    repo.add(expense(cash, '2026-09-26', 1250));
    expect(await balances()).toEqual({ Bank: 100000, Cash: 3750 });
  });

  it("watches an account's transactions on either side, newest date first, up to the limit", async () => {
    repo.add(expense(cash, '2026-09-01'));
    repo.add(expense(bank, '2026-09-02'));
    repo.add({
      ...expense(bank, '2026-09-03'),
      type: 'transfer',
      toAccountId: cash,
      categoryId: null,
    });
    repo.add(expense(cash, '2026-09-04'));

    const dates = async (limit: number) =>
      (await firstValueFrom(repo.watchByAccount(cash, limit))).map((t) => t.date);
    expect(await dates(50)).toEqual(['2026-09-04', '2026-09-03', '2026-09-01']);
    expect(await dates(2)).toEqual(['2026-09-04', '2026-09-03']);
    expect((await repo.listByAccount(bank)).length).toBe(2);
  });
});
