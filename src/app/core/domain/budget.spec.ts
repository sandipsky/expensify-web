import { Budget } from '../models/budget';
import { Category } from '../models/category';
import { Transaction } from '../models/transaction';
import {
  alertDue,
  budgetHistory,
  budgetPeriodRange,
  budgetProgress,
  budgetResult,
  budgetSpent,
  budgetState,
  carryOver,
  compareBudgets,
  countsToward,
  createdDate,
  daysLeft,
  hasReached,
  neededRange,
  percentUsed,
  safePerDay,
} from './budget';

type Tx = Pick<Transaction, 'type' | 'amount' | 'categoryId' | 'date'>;

/** Local midnight of the date, as a server timestamp reads back. */
const at = (date: string) => ({ toMillis: () => new Date(`${date}T00:00:00`).getTime() });

const budget = (overrides: Partial<Budget> = {}): Budget => ({
  id: 'b1',
  name: 'Food',
  amount: 50000,
  period: 'monthly',
  categoryIds: ['exp_food'],
  rollover: false,
  alertThresholds: [80, 100],
  lastAlert: null,
  active: true,
  createdAt: at('2026-01-01'),
  updatedAt: null,
  ...overrides,
});

const expense = (amount: number, date: string, categoryId = 'exp_food'): Tx => ({
  type: 'expense',
  amount,
  categoryId,
  date,
});

const categories = new Map<string, Pick<Category, 'parentId'>>([
  ['exp_food', { parentId: null }],
  ['exp_food_groceries', { parentId: 'exp_food' }],
  ['exp_transport', { parentId: null }],
]);

const monthly = { monthStartDay: 1, weekStartDay: 1 };

describe('budgets (§3.8)', () => {
  describe('periods (BUD-08)', () => {
    it('follows the month start day for monthly budgets (BR-05)', () => {
      expect(budgetPeriodRange('monthly', '2026-09-26', { ...monthly, monthStartDay: 25 })).toEqual(
        { start: '2026-09-25', end: '2026-10-24' },
      );
    });

    it('follows the week start day for weekly budgets', () => {
      expect(budgetPeriodRange('weekly', '2026-09-27', monthly)).toEqual({
        start: '2026-09-21',
        end: '2026-09-27',
      });
      expect(budgetPeriodRange('weekly', '2026-09-27', { ...monthly, weekStartDay: 7 })).toEqual({
        start: '2026-09-27',
        end: '2026-10-03',
      });
    });

    it('makes a year of twelve budget months', () => {
      expect(budgetPeriodRange('yearly', '2026-09-27', monthly)).toEqual({
        start: '2026-01-01',
        end: '2026-12-31',
      });
      expect(budgetPeriodRange('yearly', '2026-09-27', { ...monthly, monthStartDay: 25 })).toEqual({
        start: '2025-12-25',
        end: '2026-12-24',
      });
    });
  });

  describe('what counts (BUD-04, BR-07)', () => {
    it('counts expenses in the categories and their subcategories', () => {
      const food = budget();
      expect(countsToward(food, expense(1, '', 'exp_food'), categories)).toBe(true);
      expect(countsToward(food, expense(1, '', 'exp_food_groceries'), categories)).toBe(true);
      expect(countsToward(food, expense(1, '', 'exp_transport'), categories)).toBe(false);
    });

    it('counts only the subcategory when the budget names it', () => {
      const groceries = budget({ categoryIds: ['exp_food_groceries'] });
      expect(countsToward(groceries, expense(1, '', 'exp_food'), categories)).toBe(false);
      expect(countsToward(groceries, expense(1, '', 'exp_food_groceries'), categories)).toBe(true);
    });

    it('counts every expense when no category is chosen', () => {
      const all = budget({ categoryIds: [] });
      expect(countsToward(all, expense(1, '', 'exp_transport'), categories)).toBe(true);
      expect(countsToward(all, expense(1, '', 'exp_uncategorized'), categories)).toBe(true);
    });

    it('never counts transfers, income or balance adjustments (TXN-09, BR-12)', () => {
      const all = budget({ categoryIds: [] });
      expect(countsToward(all, { type: 'transfer', categoryId: null }, categories)).toBe(false);
      expect(countsToward(all, { type: 'income', categoryId: 'exp_food' }, categories)).toBe(false);
      expect(countsToward(all, expense(1, '', 'exp_adjustment'), categories)).toBe(false);
    });

    it('sums only the period, counting an entry once even if the budget names its parent too', () => {
      const both = budget({ categoryIds: ['exp_food', 'exp_food_groceries'] });
      const txs = [
        expense(1000, '2026-08-31'),
        expense(2000, '2026-09-01', 'exp_food_groceries'),
        expense(3000, '2026-09-30'),
        expense(4000, '2026-10-01'),
      ];
      expect(budgetSpent(both, txs, { start: '2026-09-01', end: '2026-09-30' }, categories)).toBe(
        5000,
      );
    });
  });

  describe('states and figures (BUD-02, BUD-03, BR-08)', () => {
    it('is on track under 80%, warning from 80% and over from 100%', () => {
      expect(budgetState(39999, 50000)).toBe('on_track');
      expect(budgetState(40000, 50000)).toBe('warning');
      expect(budgetState(49999, 50000)).toBe('warning');
      expect(budgetState(50000, 50000)).toBe('over');
      expect(budgetState(0, 0)).toBe('over');
    });

    it('rounds the percent down so it never contradicts the state (BR-11)', () => {
      expect(percentUsed(39800, 50000)).toBe(79);
      expect(budgetState(39800, 50000)).toBe('on_track');
      expect(percentUsed(43000, 50000)).toBe(86);
      expect(percentUsed(75000, 50000)).toBe(150);
      expect(percentUsed(100, 0)).toBeNull();
    });

    it('compares thresholds in integers', () => {
      expect(hasReached(4, 5, 80)).toBe(true);
      expect(hasReached(3, 5, 80)).toBe(false);
      expect(hasReached(1, 3, 33)).toBe(true);
    });

    it('counts the days left including today', () => {
      const september = { start: '2026-09-01', end: '2026-09-30' };
      expect(daysLeft(september, '2026-09-27')).toBe(4);
      expect(daysLeft(september, '2026-09-30')).toBe(1);
      expect(daysLeft(september, '2026-10-01')).toBe(0);
      expect(daysLeft(september, '2026-08-15')).toBe(30);
    });

    it('rounds safe-to-spend down and never goes negative', () => {
      expect(safePerDay(10000, 3)).toBe(3333);
      expect(safePerDay(0, 3)).toBe(0);
      expect(safePerDay(-500, 3)).toBe(0);
      expect(safePerDay(500, 0)).toBe(0);
    });

    it('shows the warning state at 86% after a 50.00 expense on 380.00 of 500.00 (US-04)', () => {
      const txs = [expense(38000, '2026-09-10'), expense(5000, '2026-09-26')];
      const progress = budgetProgress(budget(), txs, '2026-09-26', monthly, categories);
      expect(progress).toEqual({
        range: { start: '2026-09-01', end: '2026-09-30' },
        spent: 43000,
        limit: 50000,
        carry: 0,
        remaining: 7000,
        percent: 86,
        state: 'warning',
        daysLeft: 5,
        safePerDay: 1400,
      });
    });
  });

  describe('rollover (BUD-07)', () => {
    const rolling = budget({ rollover: true });

    it('adds last period’s unspent amount to this one', () => {
      const txs = [expense(30000, '2026-08-15'), expense(10000, '2026-09-02')];
      const result = budgetResult(rolling, txs, '2026-09-26', monthly, categories);
      expect(result).toMatchObject({ carry: 20000, limit: 70000, remaining: 60000, percent: 14 });
    });

    it('takes last period’s overspend off this one, never below zero', () => {
      const over = [expense(70000, '2026-08-15')];
      expect(budgetResult(rolling, over, '2026-09-26', monthly, categories)).toMatchObject({
        carry: -20000,
        limit: 30000,
      });
      const wayOver = [expense(120000, '2026-08-15'), expense(100, '2026-09-02')];
      expect(budgetResult(rolling, wayOver, '2026-09-26', monthly, categories)).toMatchObject({
        carry: -70000,
        limit: 0,
        remaining: -100,
        percent: null,
        state: 'over',
      });
    });

    it('reaches back one period only, not compounding', () => {
      // July spent nothing: a compounding rollover would carry that 500.00 on into September.
      const txs = [expense(50000, '2026-08-15')];
      expect(budgetResult(rolling, txs, '2026-09-26', monthly, categories).carry).toBe(0);
    });

    it('carries nothing from before the budget was created, or while it is unconfirmed', () => {
      const previous = { range: { start: '2026-08-01', end: '2026-08-31' }, spent: 10000 };
      expect(carryOver({ ...rolling, createdAt: at('2026-09-03') }, previous)).toBe(0);
      expect(carryOver({ ...rolling, createdAt: at('2026-08-31') }, previous)).toBe(40000);
      expect(carryOver({ ...rolling, createdAt: null }, previous)).toBe(0);
      expect(carryOver({ ...rolling, rollover: false }, previous)).toBe(0);
    });

    it('needs the period before when it rolls over', () => {
      expect(neededRange(budget(), '2026-09-26', monthly)).toEqual({
        start: '2026-09-01',
        end: '2026-09-30',
      });
      expect(neededRange(rolling, '2026-09-26', monthly, 2)).toEqual({
        start: '2026-06-01',
        end: '2026-09-30',
      });
    });
  });

  describe('history (BUD-05)', () => {
    it('lists past periods newest first, marking those before the budget existed', () => {
      const food = budget({ createdAt: at('2026-08-20') });
      const txs = [expense(60000, '2026-08-05'), expense(20000, '2026-07-05')];
      const history = budgetHistory(food, txs, '2026-09-26', monthly, categories, 3);
      expect(history.map((h) => [h.range.start, h.spent, h.state, h.beforeBudget])).toEqual([
        ['2026-08-01', 60000, 'over', false],
        ['2026-07-01', 20000, 'on_track', true],
        ['2026-06-01', 0, 'on_track', true],
      ]);
    });

    it('applies each past period’s own rollover', () => {
      const food = budget({ rollover: true, createdAt: at('2026-07-01') });
      const txs = [expense(40000, '2026-07-05'), expense(55000, '2026-08-05')];
      const [august, july] = budgetHistory(food, txs, '2026-09-26', monthly, categories, 2);
      expect(july).toMatchObject({ carry: 0, limit: 50000 });
      expect(august).toMatchObject({ carry: 10000, limit: 60000, percent: 91, state: 'warning' });
    });
  });

  describe('alerts (BUD-06)', () => {
    const september = { start: '2026-09-01', end: '2026-09-30' };
    const result = (spent: number) => ({ range: september, spent, limit: 50000 });

    it('sends 80% once per period, then 100% (US-04)', () => {
      expect(alertDue(budget(), result(38000))).toBeNull();
      expect(alertDue(budget(), result(43000))).toBe(80);
      const alerted = budget({ lastAlert: { periodStart: '2026-09-01', threshold: 80 } });
      expect(alertDue(alerted, result(45000))).toBeNull();
      expect(alertDue(alerted, result(50000))).toBe(100);
    });

    it('sends only the higher threshold when spending jumps past both', () => {
      expect(alertDue(budget(), result(60000))).toBe(100);
    });

    it('starts over in a new period', () => {
      const lastMonth = budget({ lastAlert: { periodStart: '2026-08-01', threshold: 100 } });
      expect(alertDue(lastMonth, result(40000))).toBe(80);
    });

    it('stays quiet for paused budgets and budgets without thresholds', () => {
      expect(alertDue(budget({ active: false }), result(60000))).toBeNull();
      expect(alertDue(budget({ alertThresholds: [] }), result(60000))).toBeNull();
    });
  });

  it('reads the creation date in local time', () => {
    expect(createdDate({ createdAt: at('2026-09-27') })).toBe('2026-09-27');
    expect(createdDate({ createdAt: null })).toBeNull();
  });

  it('lists budgets for every expense first, then by name', () => {
    const list = [
      budget({ name: 'Transport', categoryIds: ['exp_transport'] }),
      budget({ name: 'Monthly spending', categoryIds: [] }),
      budget({ name: 'Food' }),
    ];
    expect(list.sort(compareBudgets).map((b) => b.name)).toEqual([
      'Monthly spending',
      'Food',
      'Transport',
    ]);
  });
});
