import { ACCOUNT_TYPES } from '../../core/models/account';
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_OPTIONS,
  balanceView,
  utilizationView,
} from './account-labels';

describe('account labels', () => {
  it('labels every account type', () => {
    expect(ACCOUNT_TYPE_OPTIONS.map((o) => o.value)).toEqual([...ACCOUNT_TYPES]);
    expect(ACCOUNT_TYPE_LABELS.wallet).toBe('Mobile wallet');
  });

  describe('balanceView', () => {
    it('shows normal accounts as a balance, flagging one below zero', () => {
      expect(balanceView({ type: 'bank', currentBalance: 5000 })).toEqual({
        caption: 'Balance',
        amount: 5000,
        negative: false,
      });
      expect(balanceView({ type: 'bank', currentBalance: -300 })).toEqual({
        caption: 'Balance',
        amount: -300,
        negative: true,
      });
    });

    it('shows cards and loans as the amount owed, or in credit (ACC-08)', () => {
      expect(balanceView({ type: 'credit_card', currentBalance: -32000 })).toEqual({
        caption: 'Owed',
        amount: 32000,
        negative: false,
      });
      expect(balanceView({ type: 'loan', currentBalance: 0 }).caption).toBe('Owed');
      expect(balanceView({ type: 'credit_card', currentBalance: 1500 })).toEqual({
        caption: 'In credit',
        amount: 1500,
        negative: false,
      });
    });
  });

  describe('utilizationView (ACC-08)', () => {
    it('rounds for display and colors by how much is used', () => {
      const card = (currentBalance: number) => ({
        type: 'credit_card' as const,
        currentBalance,
        creditLimit: 100000,
      });
      expect(utilizationView(card(-32449))).toEqual({ percent: 32, variant: 'accent' });
      expect(utilizationView(card(-80000))).toEqual({ percent: 80, variant: 'warn' });
      expect(utilizationView(card(-100000))).toEqual({ percent: 100, variant: 'error' });
    });

    it('is absent without a limit or for other types', () => {
      expect(
        utilizationView({ type: 'credit_card', currentBalance: -1, creditLimit: null }),
      ).toBeNull();
      expect(utilizationView({ type: 'loan', currentBalance: -1, creditLimit: 5000 })).toBeNull();
    });
  });
});
