import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { NewTransaction } from '../models/transaction';
import { AccountsRepo, NewAccount } from './accounts.repo';
import { TransactionsRepo } from './transactions.repo';
import { WriteErrors } from './write-errors';

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

describe('AccountsRepo', () => {
  let repo: AccountsRepo;
  let transactions: TransactionsRepo;
  let report: ReturnType<typeof vi.fn<(error: unknown) => void>>;

  const all = () => firstValueFrom(repo.watchAll());

  beforeEach(() => {
    localStorage.clear();
    repo = TestBed.inject(AccountsRepo);
    transactions = TestBed.inject(TransactionsRepo);
    report = vi.fn<(error: unknown) => void>();
    TestBed.inject(WriteErrors).report = report;
  });

  it('creates an account whose current balance starts at its opening balance (ACC-01)', async () => {
    const id = repo.create(newAccount());
    const [account] = await all();
    expect(account).toMatchObject({
      id,
      name: 'Cash',
      openingBalance: 5000,
      currentBalance: 5000,
      archived: false,
      pending: false,
    });
    expect(account.createdAt?.toMillis()).toEqual(expect.any(Number));
  });

  it('lists accounts by sortOrder', async () => {
    repo.create(newAccount({ name: 'Second', sortOrder: 1 }));
    repo.create(newAccount({ name: 'First', sortOrder: 0 }));
    expect((await all()).map((a) => a.name)).toEqual(['First', 'Second']);
  });

  it('shifts the current balance by the change in opening balance (ACC-03)', async () => {
    const id = repo.create(newAccount({ openingBalance: 5000 }));
    transactions.add(tx({ accountId: id, amount: 1500 }));
    let [account] = await all();
    expect(account.currentBalance).toBe(3500);

    repo.update(account, { openingBalance: 8000, name: 'Wallet' });
    [account] = await all();
    expect(account).toMatchObject({ name: 'Wallet', openingBalance: 8000, currentBalance: 6500 });
  });

  it('archives and restores, keeping the account (ACC-04)', async () => {
    const id = repo.create(newAccount());
    repo.setArchived(id, true);
    expect((await all())[0].archived).toBe(true);
    repo.setArchived(id, false);
    expect((await all())[0].archived).toBe(false);
  });

  it('deletes an account with its transactions and reverses transfers on the other account (ACC-05)', async () => {
    const cash = repo.create(newAccount({ name: 'Cash', openingBalance: 5000 }));
    const bank = repo.create(newAccount({ name: 'Bank', openingBalance: 100000, sortOrder: 1 }));
    transactions.add(
      tx({ type: 'transfer', amount: 20000, accountId: bank, toAccountId: cash, categoryId: null }),
    );
    transactions.add(tx({ accountId: cash, amount: 1000 }));
    transactions.add(
      tx({ type: 'income', amount: 5000, accountId: bank, categoryId: 'inc_salary' }),
    );
    expect((await all()).map((a) => a.currentBalance)).toEqual([24000, 85000]);

    repo.delete(cash, await transactions.listByAccount(cash));

    expect((await all()).map((a) => [a.name, a.currentBalance])).toEqual([['Bank', 105000]]);
    const left = await transactions.listByAccount(bank);
    expect(left.map((t) => t.type)).toEqual(['income']);
  });

  it('restores a deleted account under its old ID (Undo)', async () => {
    const id = repo.create(newAccount({ name: 'Wallet' }));
    const [account] = await all();
    repo.delete(id, []);
    expect(await all()).toEqual([]);

    repo.restore(account);
    const [restored] = await all();
    expect(restored).toMatchObject({ id, name: 'Wallet', currentBalance: 5000 });
    expect(restored.createdAt?.toMillis()).toBe(account.createdAt?.toMillis());
  });

  it('reports a failed write instead of throwing', async () => {
    repo.setArchived('missing', true);
    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce());
  });
});
