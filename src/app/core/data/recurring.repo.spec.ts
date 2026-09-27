import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { NewRecurringRule, RecurringRule } from '../models/recurring';
import { LocalDb } from './local-db';
import { RecurringRepo } from './recurring.repo';

const salary = (overrides: Partial<NewRecurringRule> = {}): NewRecurringRule => ({
  template: {
    type: 'income',
    amount: 300000,
    accountId: 'bank',
    toAccountId: null,
    categoryId: 'inc_salary',
    payee: 'Acme',
    note: null,
    tags: [],
  },
  frequency: 'monthly',
  interval: 1,
  weekdays: [],
  dayOfMonth: 1,
  startDate: '2026-07-01',
  endType: 'never',
  endDate: null,
  maxCount: null,
  occurrences: 0,
  nextDueDate: '2026-07-01',
  mode: 'auto',
  active: true,
  ...overrides,
});

describe('RecurringRepo', () => {
  let db: LocalDb;
  let repo: RecurringRepo;

  const balance = async (id: string) =>
    (await db.get('users/local/accounts')).find((d) => d.id === id)?.data['currentBalance'];
  const transactions = () => db.get('users/local/transactions', { orderBy: [['date', 'asc']] });
  const rule = async (id: string): Promise<RecurringRule> =>
    (await firstValueFrom(repo.watchAll())).find((r) => r.id === id)!;

  beforeEach(async () => {
    localStorage.clear();
    db = TestBed.inject(LocalDb);
    repo = TestBed.inject(RecurringRepo);
    await db
      .batch()
      .set('users/local/accounts/bank', { name: 'Bank', currency: 'USD', currentBalance: 1000 })
      .set('users/local/accounts/cash', { name: 'Cash', currency: 'USD', currentBalance: 0 })
      .commit();
  });

  describe('generate (REC-05, REC-06)', () => {
    it('creates each missed occurrence under its fixed ID, moves the balance and advances the rule', async () => {
      const id = repo.create(salary());
      expect(await repo.generate(id, '2026-09-27')).toBe(3);

      const txs = await transactions();
      expect(txs.map((d) => d.id)).toEqual([`${id}_20260701`, `${id}_20260801`, `${id}_20260901`]);
      expect(txs[0].data).toMatchObject({
        type: 'income',
        amount: 300000,
        currency: 'USD',
        accountIds: ['bank'],
        categoryId: 'inc_salary',
        date: '2026-07-01',
        recurringRuleId: id,
        source: 'recurring',
      });
      expect(await balance('bank')).toBe(1000 + 3 * 300000);
      expect(await rule(id)).toMatchObject({ occurrences: 3, nextDueDate: '2026-10-01' });
    });

    it('creates exactly one occurrence however many callers run at once (US-08)', async () => {
      const id = repo.create(salary({ startDate: '2026-10-01', nextDueDate: '2026-10-01' }));
      const results = await Promise.all([
        repo.generate(id, '2026-10-01'),
        repo.generate(id, '2026-10-01'),
        repo.generate(id, '2026-10-01'),
      ]);
      expect(results.reduce((a, b) => a + b, 0)).toBe(1);
      expect(await transactions()).toHaveLength(1);
      expect(await balance('bank')).toBe(1000 + 300000);
      expect(await repo.generate(id, '2026-10-01')).toBe(0);
    });

    it('moves both balances of a transfer', async () => {
      const id = repo.create(
        salary({
          template: {
            ...salary().template,
            type: 'transfer',
            toAccountId: 'cash',
            categoryId: null,
          },
          nextDueDate: '2026-09-01',
        }),
      );
      await repo.generate(id, '2026-09-27');
      expect(await balance('bank')).toBe(1000 - 300000);
      expect(await balance('cash')).toBe(300000);
    });

    it('stops once a counted rule has run its course (REC-03)', async () => {
      const id = repo.create(salary({ endType: 'count', maxCount: 2 }));
      expect(await repo.generate(id, '2026-12-31')).toBe(2);
      expect(await rule(id)).toMatchObject({ occurrences: 2, nextDueDate: '2026-09-01' });
    });

    it('catches up more than one write can hold', async () => {
      const id = repo.create(
        salary({
          frequency: 'daily',
          dayOfMonth: null,
          startDate: '2026-01-01',
          nextDueDate: '2026-01-01',
        }),
      );
      expect(await repo.generate(id, '2026-06-30')).toBe(181);
      expect(await rule(id)).toMatchObject({ occurrences: 181, nextDueDate: '2026-07-01' });
    });

    it('leaves ask-first and paused rules alone', async () => {
      const ask = repo.create(salary({ mode: 'confirm' }));
      const paused = repo.create(salary({ active: false }));
      expect(await repo.generate(ask, '2026-09-27')).toBe(0);
      expect(await repo.generate(paused, '2026-09-27')).toBe(0);
      expect(await transactions()).toHaveLength(0);
    });

    it('writes nothing while an account the entries need is missing', async () => {
      const id = repo.create(salary({ template: { ...salary().template, accountId: 'gone' } }));
      expect(await repo.generate(id, '2026-09-27')).toBe(0);
      expect(await transactions()).toHaveLength(0);
      expect((await rule(id)).nextDueDate).toBe('2026-07-01');
    });
  });

  describe('confirm and skip (REC-04)', () => {
    it('confirms the next due date, as the template has it', async () => {
      const id = repo.create(salary({ mode: 'confirm', nextDueDate: '2026-09-01' }));
      expect(await repo.confirm(id, '2026-09-01')).toBe('done');
      const [tx] = await transactions();
      expect(tx.id).toBe(`${id}_20260901`);
      expect(await rule(id)).toMatchObject({ occurrences: 1, nextDueDate: '2026-10-01' });
      expect(await balance('bank')).toBe(1000 + 300000);
    });

    it('confirms an edited entry under the scheduled date’s ID', async () => {
      const id = repo.create(salary({ mode: 'confirm', nextDueDate: '2026-09-01' }));
      await repo.confirm(id, '2026-09-01', {
        type: 'income',
        amount: 310000,
        currency: 'USD',
        accountId: 'cash',
        toAccountId: null,
        categoryId: 'inc_salary',
        date: '2026-09-02',
        time: '09:00',
        payee: 'Acme',
        note: 'With a bonus',
        tags: [],
      });
      const [tx] = await transactions();
      expect(tx.id).toBe(`${id}_20260901`);
      expect(tx.data).toMatchObject({ amount: 310000, date: '2026-09-02', recurringRuleId: id });
      expect(await balance('cash')).toBe(310000);
      expect(await balance('bank')).toBe(1000);
    });

    it('skips without creating anything or counting it', async () => {
      const id = repo.create(salary({ mode: 'confirm', nextDueDate: '2026-09-01' }));
      expect(await repo.skip(id, '2026-09-01')).toBe('done');
      expect(await transactions()).toHaveLength(0);
      expect(await rule(id)).toMatchObject({ occurrences: 0, nextDueDate: '2026-10-01' });
    });

    it('reports a date another device already handled as stale', async () => {
      const id = repo.create(salary({ mode: 'confirm', nextDueDate: '2026-09-01' }));
      await repo.skip(id, '2026-09-01');
      expect(await repo.confirm(id, '2026-09-01')).toBe('stale');
      expect(await repo.skip(id, '2026-09-01')).toBe('stale');
    });

    it('confirms nothing into a deleted account', async () => {
      const id = repo.create(
        salary({ mode: 'confirm', template: { ...salary().template, accountId: 'gone' } }),
      );
      expect(await repo.confirm(id, '2026-07-01')).toBe('missing-account');
    });
  });

  it('updates template fields one by one (SYN-03)', async () => {
    const id = repo.create(salary());
    repo.update(id, { template: { amount: 320000 }, interval: 2 });
    await Promise.resolve();
    expect(await rule(id)).toMatchObject({
      interval: 2,
      template: { amount: 320000, payee: 'Acme', accountId: 'bank' },
    });
  });

  it('finds the rules that use a category (CAT-06)', async () => {
    const id = repo.create(salary());
    repo.create(salary({ template: { ...salary().template, categoryId: 'inc_other' } }));
    expect((await repo.listByCategory('inc_salary')).map((r) => r.id)).toEqual([id]);
  });

  it('restores a deleted rule under its old ID', async () => {
    const id = repo.create(salary());
    const before = await rule(id);
    repo.delete(id);
    repo.restore(before);
    expect(await rule(id)).toMatchObject({ nextDueDate: '2026-07-01', template: before.template });
  });
});
