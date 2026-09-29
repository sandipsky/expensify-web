import { Category } from '../models/category';
import { Transaction, TxType } from '../models/transaction';
import {
  accountFlows,
  categoryChanges,
  categoryTotals,
  changeOf,
  changePercent,
  largestExpenses,
  periodSummaries,
  recentMonths,
  savingsRate,
  shareOf,
  summaryChange,
  topAndOther,
  topPayees,
  yearMonths,
} from './reports';

type Tx = Pick<
  Transaction,
  'type' | 'amount' | 'categoryId' | 'date' | 'accountId' | 'toAccountId' | 'payee'
>;

const tx = (
  type: TxType,
  amount: number,
  categoryId: string | null,
  date = '2026-09-10',
  extra: Partial<Tx> = {},
): Tx => ({
  type,
  amount,
  categoryId,
  date,
  accountId: 'cash',
  toAccountId: null,
  payee: null,
  ...extra,
});

/** Groceries and Coffee sit under Food (CAT-07). */
const categories = new Map<string, Pick<Category, 'parentId'>>([
  ['exp_food', { parentId: null }],
  ['groceries', { parentId: 'exp_food' }],
  ['coffee', { parentId: 'exp_food' }],
  ['exp_housing', { parentId: null }],
  ['inc_salary', { parentId: null }],
]);

describe('percentages (BR-04, BR-11)', () => {
  it('shares a total in whole percent, rounding halves up', () => {
    expect(shareOf(1, 3)).toBe(33);
    expect(shareOf(1, 8)).toBe(13);
    expect(shareOf(5, 0)).toBeNull();
  });

  it('shows no savings rate without income', () => {
    expect(savingsRate(300000, 60000)).toBe(20);
    expect(savingsRate(100000, -50000)).toBe(-50);
    expect(savingsRate(0, -500)).toBeNull();
  });

  it('measures change against the earlier figure, and not at all from nothing', () => {
    expect(changePercent(20000, 25000)).toBe(25);
    expect(changePercent(20000, 15000)).toBe(-25);
    expect(changePercent(-10000, -5000)).toBe(50);
    expect(changePercent(0, 5000)).toBeNull();
  });
});

describe('categoryTotals (RPT-01)', () => {
  const txs = [
    tx('expense', 1000, 'groceries'),
    tx('expense', 500, 'coffee'),
    tx('expense', 700, 'exp_food'),
    tx('expense', 5000, 'exp_housing'),
    tx('expense', 300, null),
    tx('expense', 999, 'exp_adjustment'),
    tx('transfer', 9000, null, '2026-09-10', { toAccountId: 'bank' }),
    tx('income', 300000, 'inc_salary'),
  ];

  it('rolls subcategories into their parent, largest first, without transfers or adjustments', () => {
    expect(categoryTotals(txs, 'expense', categories)).toEqual([
      { categoryId: 'exp_housing', amount: 5000, count: 1 },
      { categoryId: 'exp_food', amount: 2200, count: 3 },
      { categoryId: '', amount: 300, count: 1 },
    ]);
    expect(categoryTotals(txs, 'income', categories)).toEqual([
      { categoryId: 'inc_salary', amount: 300000, count: 1 },
    ]);
  });

  it('folds everything past the top rows into Other', () => {
    const rows = categoryTotals(txs, 'expense', categories);
    expect(topAndOther(rows, 1)).toEqual({
      top: [rows[0]],
      other: { amount: 2500, count: 4, categoryIds: ['exp_food', ''] },
    });
    expect(topAndOther(rows, 5).other).toBeNull();
  });
});

describe('periodSummaries (RPT-02, RPT-05)', () => {
  it('sums each period apart, with its savings rate', () => {
    const txs = [
      tx('income', 300000, 'inc_salary', '2026-08-01'),
      tx('expense', 100000, 'exp_housing', '2026-08-05'),
      tx('expense', 20000, 'exp_food', '2026-09-02'),
      tx('expense', 5000, 'exp_adjustment', '2026-09-03'),
    ];
    const [aug, sep] = periodSummaries(txs, [
      { start: '2026-08-01', end: '2026-08-31' },
      { start: '2026-09-01', end: '2026-09-30' },
    ]);
    expect(aug).toMatchObject({ income: 300000, expense: 100000, net: 200000, savingsRate: 67 });
    expect(sep).toMatchObject({ income: 0, expense: 20000, net: -20000, savingsRate: null });
  });

  it('lists the last months oldest first, following the month start day (BR-05)', () => {
    expect(recentMonths('2026-09-27', 25, 3)).toEqual([
      { start: '2026-07-25', end: '2026-08-24' },
      { start: '2026-08-25', end: '2026-09-24' },
      { start: '2026-09-25', end: '2026-10-24' },
    ]);
    expect(recentMonths('2026-09-27', 1, 12)[0]).toEqual({
      start: '2025-10-01',
      end: '2025-10-31',
    });
  });

  it('splits a year into its twelve month periods', () => {
    const calendar = yearMonths('2026-09-27', 1);
    expect(calendar).toHaveLength(12);
    expect(calendar[0]).toEqual({ start: '2026-01-01', end: '2026-01-31' });
    expect(calendar[11]).toEqual({ start: '2026-12-01', end: '2026-12-31' });
    const salaryYear = yearMonths('2026-09-27', 25, -1);
    expect(salaryYear[0]).toEqual({ start: '2024-12-25', end: '2025-01-24' });
    expect(salaryYear[11]).toEqual({ start: '2025-11-25', end: '2025-12-24' });
  });
});

describe('categoryChanges (RPT-03)', () => {
  it('lines up each category in both periods with the change in amount and %', () => {
    const before = [tx('expense', 20000, 'exp_food'), tx('expense', 5000, 'exp_housing')];
    const now = [
      tx('expense', 25000, 'groceries'),
      tx('expense', 800, 'coffee'),
      tx('expense', 1000, 'new'),
    ];
    expect(categoryChanges(before, now, 'expense', categories)).toEqual([
      { categoryId: 'exp_food', previous: 20000, current: 25800, change: 5800, percent: 29 },
      { categoryId: 'new', previous: 0, current: 1000, change: 1000, percent: null },
      { categoryId: 'exp_housing', previous: 5000, current: 0, change: -5000, percent: -100 },
    ]);
  });
});

describe('accountFlows (RPT-06)', () => {
  it('counts income, expense and transfers in and out per account, without adjustments', () => {
    const flows = accountFlows([
      tx('income', 300000, 'inc_salary', '2026-09-01', { accountId: 'bank' }),
      tx('transfer', 50000, null, '2026-09-02', { accountId: 'bank', toAccountId: 'cash' }),
      tx('expense', 12000, 'exp_food', '2026-09-03', { accountId: 'cash' }),
      tx('expense', 700, 'exp_adjustment', '2026-09-04', { accountId: 'cash' }),
    ]);
    expect(flows).toEqual([
      {
        accountId: 'bank',
        income: 300000,
        expense: 0,
        transfersIn: 0,
        transfersOut: 50000,
        moneyIn: 300000,
        moneyOut: 50000,
        net: 250000,
      },
      {
        accountId: 'cash',
        income: 0,
        expense: 12000,
        transfersIn: 50000,
        transfersOut: 0,
        moneyIn: 50000,
        moneyOut: 12000,
        net: 38000,
      },
    ]);
  });
});

describe('payees and largest expenses (RPT-07)', () => {
  const txs = [
    tx('expense', 1500, 'exp_food', '2026-09-20', { payee: 'Cafe Nero ' }),
    tx('expense', 900, 'exp_food', '2026-09-18', { payee: 'cafe nero' }),
    tx('expense', 20000, 'exp_housing', '2026-09-01', { payee: 'Landlord' }),
    tx('expense', 20000, 'exp_housing', '2026-09-02', { payee: null }),
    tx('income', 99999, 'inc_salary', '2026-09-01', { payee: 'Acme' }),
    tx('expense', 50000, 'exp_adjustment', '2026-09-05', { payee: 'Fix' }),
  ];

  it('totals expenses per payee ignoring case, spelled as the newest entry has it', () => {
    expect(topPayees(txs, 5)).toEqual([
      { payee: 'Landlord', amount: 20000, count: 1 },
      { payee: 'Cafe Nero', amount: 2400, count: 2 },
    ]);
    expect(topPayees(txs, 1)).toHaveLength(1);
  });

  it('lists the largest expenses, keeping the given order on a tie', () => {
    const largest = largestExpenses(txs, 3);
    expect(largest.map((t) => [t.amount, t.date])).toEqual([
      [20000, '2026-09-01'],
      [20000, '2026-09-02'],
      [1500, '2026-09-20'],
    ]);
  });
});

describe('summaryChange (DSH-10)', () => {
  it("gives each figure's change as an amount and a percent", () => {
    expect(changeOf(20000, 25000)).toEqual({ amount: 5000, percent: 25 });
    expect(changeOf(0, 5000)).toEqual({ amount: 5000, percent: null });
    const change = summaryChange(
      { income: 300000, expense: 100000, net: 200000, savingsRate: 67 },
      { income: 300000, expense: 150000, net: 150000, savingsRate: 50 },
    );
    expect(change.income).toEqual({ amount: 0, percent: 0 });
    expect(change.expense).toEqual({ amount: 50000, percent: 50 });
    expect(change.net).toEqual({ amount: -50000, percent: -25 });
    expect(change.savingsRate).toBe(-17);
  });

  it('has no savings rate change when either period had no income (BR-04)', () => {
    const none = { income: 0, expense: 1000, net: -1000, savingsRate: null };
    const some = { income: 1000, expense: 0, net: 1000, savingsRate: 100 };
    expect(summaryChange(none, some).savingsRate).toBeNull();
    expect(summaryChange(some, none).savingsRate).toBeNull();
  });
});
