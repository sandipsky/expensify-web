import { combineEffects, editEffects, effects, reverseEffects } from './balance';

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

describe('reverse and combined effects', () => {
  it('undoes a transfer on both accounts', () => {
    const tx = { type: 'transfer' as const, amount: 500, accountId: 'bank', toAccountId: 'cash' };
    expect(entries(reverseEffects(tx))).toEqual({ bank: 500, cash: -500 });
    expect(Object.is(reverseEffects({ ...tx, amount: 0 }).get('bank'), 0)).toBe(true);
  });

  it('adds several changes into one per account', () => {
    const combined = combineEffects([
      effects({ type: 'expense', amount: 300, accountId: 'cash' }),
      effects({ type: 'income', amount: 1000, accountId: 'bank' }),
      effects({ type: 'transfer', amount: 200, accountId: 'bank', toAccountId: 'cash' }),
    ]);
    expect(entries(combined)).toEqual({ cash: -100, bank: 800 });
  });
});
