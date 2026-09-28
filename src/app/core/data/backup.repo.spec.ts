import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { BACKUP_FORMAT, Backup, parseBackup } from '../domain/backup';
import { DEFAULT_CATEGORIES } from '../domain/default-categories';
import { AccountsRepo, NewAccount } from './accounts.repo';
import { BackupRepo } from './backup.repo';
import { CategoriesRepo } from './categories.repo';
import { LocalDb } from './local-db';
import { TransactionsRepo } from './transactions.repo';

const account = (name: string, openingBalance: number, sortOrder: number): NewAccount => ({
  name,
  type: 'bank',
  currency: 'USD',
  openingBalance,
  creditLimit: null,
  icon: 'x',
  color: '#000000',
  includeInTotal: true,
  archived: false,
  sortOrder,
});

/** A file as `BackupActions.download()` writes it, through JSON like a real one. */
async function backupFile(): Promise<Backup> {
  const collections = await TestBed.inject(BackupRepo).read();
  const file = {
    format: BACKUP_FORMAT,
    version: 1,
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    source: 'web',
    profile: { baseCurrency: 'USD', locale: 'en-US', monthStartDay: 1, weekStartDay: 1 },
    ...collections,
  };
  const result = parseBackup(JSON.stringify(file));
  if (!result.ok) throw new Error(result.error.code);
  return result.backup;
}

describe('BackupRepo (DAT-03, DAT-04)', () => {
  let bank: string;
  let cash: string;

  beforeEach(() => {
    localStorage.clear();
    TestBed.inject(CategoriesRepo).seed(DEFAULT_CATEGORIES.slice(0, 3));
    const accounts = TestBed.inject(AccountsRepo);
    bank = accounts.create(account('Bank', 100000, 0));
    cash = accounts.create(account('Cash', 5000, 1));
    const txs = TestBed.inject(TransactionsRepo);
    txs.add({
      type: 'expense',
      amount: 1250,
      currency: 'USD',
      accountId: cash,
      categoryId: 'exp_food',
      date: '2026-09-25',
      tags: ['work'],
      attachments: [
        { path: 'users/local/receipts/x/y.jpg', name: 'y.jpg', contentType: 'image/jpeg', size: 1 },
      ],
    });
    txs.add({
      type: 'transfer',
      amount: 20000,
      currency: 'USD',
      accountId: bank,
      toAccountId: cash,
      date: '2026-09-26',
      tags: [],
    });
  });

  it('reads every document with its ID, timestamps as ISO strings', async () => {
    const { accounts, categories, transactions, budgets, recurringRules } =
      await TestBed.inject(BackupRepo).read();
    expect(accounts.map((a) => [a.id, a['name'], a['currentBalance']])).toEqual(
      expect.arrayContaining([
        [bank, 'Bank', 80000],
        [cash, 'Cash', 23750],
      ]),
    );
    expect(categories.map((c) => c.id).sort()).toEqual(
      DEFAULT_CATEGORIES.slice(0, 3)
        .map((c) => c.id)
        .sort(),
    );
    expect(transactions).toHaveLength(2);
    expect(transactions[0]['createdAt']).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(budgets).toEqual([]);
    expect(recurringRules).toEqual([]);
  });

  it('knows whether an account holds anything a restore would clash with', async () => {
    expect(await TestBed.inject(BackupRepo).hasData()).toBe(true);
    TestBed.resetTestingModule();
    localStorage.clear();
    expect(await TestBed.inject(BackupRepo).hasData()).toBe(false);
  });

  it('restores under the same IDs, rebuilding balances from opening balances (§4)', async () => {
    const backup = await backupFile();
    // Drift in the file doesn't survive: balances come from the entries.
    backup.accounts.find((a) => a.id === cash)!['currentBalance'] = 999;
    const createdAt = backup.transactions[0]['createdAt'];

    TestBed.resetTestingModule();
    localStorage.clear();
    // The new account was seeded with categories the backup doesn't have.
    TestBed.inject(CategoriesRepo).seed(DEFAULT_CATEGORIES.slice(3, 5));
    expect(await TestBed.inject(BackupRepo).restore(backup)).toBe(true);

    const accounts = await firstValueFrom(TestBed.inject(AccountsRepo).watchAll());
    expect(accounts.map((a) => [a.id, a.currentBalance])).toEqual([
      [bank, 80000],
      [cash, 23750],
    ]);
    const db = TestBed.inject(LocalDb);
    const categories = await db.get(`${db.userPath}/categories`);
    expect(categories.map((c) => c.id).sort()).toEqual(
      DEFAULT_CATEGORIES.slice(0, 3)
        .map((c) => c.id)
        .sort(),
    );
    const txs = await TestBed.inject(TransactionsRepo).listRange(null);
    expect(txs.map((t) => t.id).sort()).toEqual(backup.transactions.map((t) => t.id).sort());
    const lunch = txs.find((t) => t.type === 'expense')!;
    // Receipt files aren't in a backup, so the list of them isn't restored.
    expect(lunch.attachments).toEqual([]);
    expect(lunch.tags).toEqual(['work']);
    expect(new Date(lunch.createdAt!.toMillis()).toISOString()).toBe(createdAt);
  });

  it('writes large backups in batches under Firestore’s cap, balances intact', async () => {
    const backup = await backupFile();
    const template = backup.transactions.find((t) => t['type'] === 'expense')!;
    backup.transactions = Array.from({ length: 1200 }, (_, i) => ({
      ...template,
      id: `bulk${i}`,
      amount: 100,
    }));
    TestBed.resetTestingModule();
    localStorage.clear();
    const repo = TestBed.inject(BackupRepo);
    const db = TestBed.inject(LocalDb);
    const batch = vi.spyOn(db, 'batch');
    expect(await repo.restore(backup)).toBe(true);
    expect(batch.mock.calls.length).toBeGreaterThanOrEqual(3);

    const accounts = await firstValueFrom(TestBed.inject(AccountsRepo).watchAll());
    expect(accounts.find((a) => a.id === cash)!.currentBalance).toBe(5000 - 1200 * 100);
  });
});
