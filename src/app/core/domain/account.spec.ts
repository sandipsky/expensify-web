import {
  ACCOUNT_TYPE_DEFAULTS,
  amountOwed,
  creditUtilization,
  flipForLiability,
  isLiability,
  reconcileAdjustment,
  runningBalances,
  totalBalance,
} from './account';
import { ACCOUNT_TYPES } from '../models/account';

describe('account rules', () => {
  it('gives every type a Material Symbols icon and a hex color', () => {
    for (const type of ACCOUNT_TYPES) {
      expect(ACCOUNT_TYPE_DEFAULTS[type].icon).toMatch(/^[a-z_]+$/);
      expect(ACCOUNT_TYPE_DEFAULTS[type].color).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  describe('ACC-08 amounts owed', () => {
    it('treats credit cards and loans as liabilities', () => {
      expect(ACCOUNT_TYPES.filter(isLiability)).toEqual(['credit_card', 'loan']);
    });

    it('flips the sign for liabilities only, never producing -0', () => {
      expect(flipForLiability('credit_card', 50000)).toBe(-50000);
      expect(flipForLiability('loan', -50000)).toBe(50000);
      expect(flipForLiability('bank', -50000)).toBe(-50000);
      expect(Object.is(flipForLiability('loan', 0), 0)).toBe(true);
    });

    it('reports what a negative balance owes', () => {
      expect(amountOwed(-32000)).toBe(32000);
      expect(amountOwed(0)).toBe(0);
      expect(amountOwed(1500)).toBe(0);
    });

    it('computes credit utilization against the limit, unrounded', () => {
      expect(creditUtilization({ currentBalance: -32000, creditLimit: 100000 })).toBe(32);
      expect(creditUtilization({ currentBalance: -1, creditLimit: 3 })).toBeCloseTo(33.333, 3);
      expect(creditUtilization({ currentBalance: -120000, creditLimit: 100000 })).toBe(120);
      expect(creditUtilization({ currentBalance: 500, creditLimit: 100000 })).toBe(0);
      expect(creditUtilization({ currentBalance: -32000, creditLimit: null })).toBeNull();
      expect(creditUtilization({ currentBalance: -32000, creditLimit: 0 })).toBeNull();
    });
  });

  describe('ACC-02 total balance', () => {
    it('sums active accounts marked "include in total", liabilities included', () => {
      const accounts = [
        { currentBalance: 100000, includeInTotal: true, archived: false },
        { currentBalance: -25000, includeInTotal: true, archived: false },
        { currentBalance: 70000, includeInTotal: false, archived: false },
        { currentBalance: 9900, includeInTotal: true, archived: true },
      ];
      expect(totalBalance(accounts)).toBe(75000);
      expect(totalBalance([])).toBe(0);
    });
  });

  describe('ACC-07 reconcile', () => {
    it('records income with the income adjustment category when the real balance is higher', () => {
      expect(reconcileAdjustment(10000, 12550)).toEqual({
        type: 'income',
        amount: 2550,
        categoryId: 'inc_adjustment',
      });
    });

    it('records an expense with the expense adjustment category when it is lower', () => {
      expect(reconcileAdjustment(10000, -500)).toEqual({
        type: 'expense',
        amount: 10500,
        categoryId: 'exp_adjustment',
      });
    });

    it('records nothing when the balances match', () => {
      expect(reconcileAdjustment(10000, 10000)).toBeNull();
    });
  });

  describe('ACC-06 running balance', () => {
    it('walks back from the current balance through newest-first transactions', () => {
      // Opening 100.00, then +50.00 income, −20.00 expense, 30.00 transferred in.
      const txs = [
        { type: 'transfer' as const, amount: 3000, accountId: 'bank', toAccountId: 'cash' },
        { type: 'expense' as const, amount: 2000, accountId: 'cash' },
        { type: 'income' as const, amount: 5000, accountId: 'cash' },
      ];
      expect(runningBalances(16000, 'cash', txs)).toEqual([16000, 13000, 15000]);
    });

    it('counts transfers out of the account as a decrease', () => {
      const txs = [
        { type: 'transfer' as const, amount: 3000, accountId: 'bank', toAccountId: 'cash' },
      ];
      expect(runningBalances(50000, 'bank', txs)).toEqual([50000]);
      expect(runningBalances(50000, 'bank', [...txs, ...txs])).toEqual([50000, 53000]);
    });
  });
});
