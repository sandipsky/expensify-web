import { editEffects, effects } from './balance';

const entries = (m: Map<string, number>) => Object.fromEntries(m);

describe('balance effects (§4)', () => {
  it('adds income to the source account', () => {
    expect(entries(effects({ type: 'income', amount: 300000, accountId: 'bank' }))).toEqual({
      bank: 300000,
    });
  });

  it('takes expenses from the source account', () => {
    expect(entries(effects({ type: 'expense', amount: 1250, accountId: 'cash' }))).toEqual({
      cash: -1250,
    });
  });

  it('moves transfers between two accounts (US-02)', () => {
    const tx = { type: 'transfer' as const, amount: 20000, accountId: 'bank', toAccountId: 'cash' };
    expect(entries(effects(tx))).toEqual({ bank: -20000, cash: 20000 });
  });

  it('reverses the old effects and applies the new ones on edit (US-03)', () => {
    const before = { type: 'expense' as const, amount: 3000, accountId: 'cash' };
    const after = { type: 'expense' as const, amount: 4500, accountId: 'bank' };
    expect(entries(editEffects(before, after))).toEqual({ cash: 3000, bank: -4500 });
  });

  it('nets out to zero when an edit changes nothing', () => {
    const tx = { type: 'income' as const, amount: 100, accountId: 'bank' };
    expect(entries(editEffects(tx, tx))).toEqual({ bank: 0 });
  });
});
