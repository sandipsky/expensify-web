import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { toNewTransaction } from '../domain/transactions';
import { NewTransaction, Transaction } from '../models/transaction';
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

  const read = async (id: string) => (await firstValueFrom(repo.watch(id)))!;

  it('watches a period by date, newest first, optionally a page at a time', async () => {
    repo.add(expense(cash, '2026-08-31'));
    repo.add(expense(cash, '2026-09-01'));
    repo.add(expense(bank, '2026-09-15'));
    repo.add(expense(cash, '2026-09-30'));
    repo.add(expense(cash, '2026-10-01'));

    const range = { start: '2026-09-01', end: '2026-09-30' };
    const dates = async (limit?: number) =>
      (await firstValueFrom(repo.watchRange(range, limit))).map((t) => t.date);
    expect(await dates()).toEqual(['2026-09-30', '2026-09-15', '2026-09-01']);
    expect(await dates(2)).toEqual(['2026-09-30', '2026-09-15']);
    const recent = await firstValueFrom(repo.watchRecent(2));
    expect(recent.map((t) => t.date)).toEqual(['2026-10-01', '2026-09-30']);
  });

  it('moves both accounts when an edit changes amount and account (US-03)', async () => {
    const id = repo.add(expense(cash, '2026-09-26', 3000));
    const before = await read(id);
    expect(await balances()).toEqual({ Bank: 100000, Cash: 2000 });

    repo.update(before, { ...toNewTransaction(before), amount: 4500, accountId: bank });

    expect(await balances()).toEqual({ Bank: 95500, Cash: 5000 });
    const after = await read(id);
    expect(after).toMatchObject({ amount: 4500, accountId: bank, accountIds: [bank] });
    expect(after.createdAt!.toMillis()).toBe(before.createdAt!.toMillis());
  });

  it('turns an expense into a transfer, updating every balance it touches (TXN-06)', async () => {
    const id = repo.add(expense(bank, '2026-09-26', 1000));
    const before = await read(id);
    repo.update(before, {
      ...toNewTransaction(before),
      type: 'transfer',
      categoryId: null,
      toAccountId: cash,
    });

    // Bank: −1000 either way. Cash gains the transfer.
    expect(await balances()).toEqual({ Bank: 99000, Cash: 6000 });
    expect(await read(id)).toMatchObject({ categoryId: null, accountIds: [bank, cash] });
  });

  it('writes nothing when an edit changes nothing', async () => {
    const id = repo.add(expense(cash, '2026-09-26'));
    const before = await read(id);
    repo.update(before, toNewTransaction(before));
    expect((await read(id)).updatedAt!.toMillis()).toBe(before.updatedAt!.toMillis());
  });

  it('deletes with the balance effect reversed, and restores it all on Undo (TXN-07)', async () => {
    const id = repo.add({
      type: 'transfer',
      amount: 20000,
      currency: 'USD',
      accountId: bank,
      toAccountId: cash,
      date: '2026-09-26',
      tags: ['move'],
    });
    const tx = await read(id);

    repo.delete(tx);
    expect(await firstValueFrom(repo.watch(id))).toBeNull();
    expect(await balances()).toEqual({ Bank: 100000, Cash: 5000 });

    repo.restore([tx]);
    expect(await read(id)).toMatchObject({ tags: ['move'], accountIds: [bank, cash] });
    expect(await balances()).toEqual({ Bank: 80000, Cash: 25000 });
  });

  it('deletes and edits many transactions in one batch each (TXN-13)', async () => {
    const ids = [
      repo.add(expense(cash, '2026-09-24', 500)),
      repo.add(expense(cash, '2026-09-25', 700)),
      repo.add(expense(bank, '2026-09-26', 900)),
    ];
    const txs: Transaction[] = await Promise.all(ids.map(read));
    expect(await balances()).toEqual({ Bank: 99100, Cash: 3800 });

    repo.updateMany(txs.slice(0, 2).map((t) => ({ before: t, after: { ...t, accountId: bank } })));
    expect(await balances()).toEqual({ Bank: 97900, Cash: 5000 });

    repo.deleteMany(await Promise.all(ids.map(read)));
    expect(await balances()).toEqual({ Bank: 100000, Cash: 5000 });
  });
  it('writes under an ID chosen first, so receipts can go up before saving (ATT-01)', async () => {
    const id = repo.newId();
    const receipt = {
      path: `users/local/receipts/${id}/r.jpg`,
      name: 'r.jpg',
      contentType: 'image/jpeg',
      size: 5,
    };
    expect(repo.add({ ...expense(cash, '2026-09-26'), attachments: [receipt] }, id)).toBe(id);
    expect(await read(id)).toMatchObject({ attachments: [receipt] });
  });

  it('resolves an edit once it went through, and a failed one to false', async () => {
    const id = repo.add(expense(cash, '2026-09-26'));
    const before = await read(id);
    await expect(repo.update(before, { ...toNewTransaction(before), amount: 5 })).resolves.toBe(
      true,
    );
    repo.delete(await read(id));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(repo.update(before, { ...toNewTransaction(before), amount: 6 })).resolves.toBe(
      false,
    );
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it('reads a range once, or everything, newest first (DAT-01)', async () => {
    repo.add(expense(cash, '2026-08-31'));
    repo.add(expense(cash, '2026-09-10'));
    repo.add(expense(bank, '2026-09-30'));
    const september = await repo.listRange({ start: '2026-09-01', end: '2026-09-30' });
    expect(september.map((t) => t.date)).toEqual(['2026-09-30', '2026-09-10']);
    expect((await repo.listRange(null)).map((t) => t.date)).toEqual([
      '2026-09-30',
      '2026-09-10',
      '2026-08-31',
    ]);
  });

  it('imports many entries in batches under Firestore’s cap, balances right (DAT-02)', async () => {
    const batch = vi.spyOn(TestBed.inject(LocalDb), 'batch');
    const txs = Array.from({ length: 1000 }, (_, i) =>
      expense(i % 2 ? cash : bank, '2026-09-01', 10),
    );
    const ids = repo.addMany(txs);
    expect(ids).toHaveLength(1000);
    expect(batch.mock.calls.length).toBe(3);
    expect(await balances()).toEqual({ Bank: 100000 - 5000, Cash: 5000 - 5000 });
    expect(await read(ids[0])).toMatchObject({ source: 'import', accountIds: [bank] });
  });
});
