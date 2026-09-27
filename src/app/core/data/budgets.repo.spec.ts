import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { BudgetsRepo } from './budgets.repo';
import { LocalDb } from './local-db';

describe('BudgetsRepo', () => {
  let repo: BudgetsRepo;
  let db: LocalDb;

  beforeEach(() => {
    localStorage.clear();
    repo = TestBed.inject(BudgetsRepo);
    db = TestBed.inject(LocalDb);
  });

  const all = () => firstValueFrom(repo.watchAll());

  it('fills what an older or newer document lacks, and reads an unknown period as monthly', async () => {
    await db
      .batch()
      .set(`${db.userPath}/budgets/old`, { name: 'Old', amount: 1000 })
      .set(`${db.userPath}/budgets/next`, { name: 'Next', amount: 1000, period: 'quarterly' })
      .commit();

    const [next, old] = (await all()).sort((a, b) => a.name.localeCompare(b.name));
    expect(old).toMatchObject({
      period: 'monthly',
      categoryIds: [],
      rollover: false,
      alertThresholds: [80, 100],
      lastAlert: null,
      active: true,
    });
    expect(next.period).toBe('monthly');
  });

  it('records alerts and finds budgets by category (BUD-06, CAT-06)', async () => {
    const id = repo.create({
      name: 'Food',
      amount: 50000,
      period: 'weekly',
      categoryIds: ['exp_food'],
      rollover: false,
      alertThresholds: [80, 100],
      active: true,
    });
    repo.recordAlert(id, { periodStart: '2026-09-21', threshold: 80 });

    const [budget] = await all();
    expect(budget.lastAlert).toEqual({ periodStart: '2026-09-21', threshold: 80 });
    expect(budget.createdAt).not.toBeNull();
    expect((await repo.listByCategory('exp_food')).map((b) => b.id)).toEqual([id]);
    expect(await repo.listByCategory('exp_transport')).toEqual([]);
  });
});
