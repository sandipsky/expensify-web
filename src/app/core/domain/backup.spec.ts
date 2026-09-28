import {
  BACKUP_FORMAT,
  BackupCollection,
  backupCounts,
  backupFileName,
  parseBackup,
} from './backup';

const file = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: BACKUP_FORMAT,
    version: 1,
    schemaVersion: 1,
    exportedAt: '2026-09-28T10:00:00.000Z',
    source: 'web',
    profile: { baseCurrency: 'USD', locale: 'en-US', monthStartDay: 25, weekStartDay: 1 },
    accounts: [{ id: 'cash', name: 'Cash', currency: 'USD', openingBalance: 500 }],
    categories: [{ id: 'exp_food', name: 'Food and dining', type: 'expense' }],
    transactions: [
      { id: 't1', type: 'expense', amount: 250, accountId: 'cash', date: '2026-09-27' },
    ],
    budgets: [{ id: 'b1', name: 'Food', amount: 10000, categoryIds: ['exp_food'] }],
    recurringRules: [{ id: 'r1', template: { type: 'expense' }, nextDueDate: '2026-10-01' }],
    ...overrides,
  });

describe('backup (DAT-03, DAT-04, Appendix C)', () => {
  it('reads a backup with its profile and documents', () => {
    const result = parseBackup(file());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.profile).toEqual({
      baseCurrency: 'USD',
      locale: 'en-US',
      monthStartDay: 25,
      weekStartDay: 1,
    });
    expect(backupCounts(result.backup)).toEqual({
      categories: 1,
      accounts: 1,
      budgets: 1,
      transactions: 1,
      recurringRules: 1,
    });
  });

  it('refuses what isn’t a backup, or comes from a newer version', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, error: { code: 'not_json' } });
    expect(parseBackup('{"accounts": []}')).toEqual({ ok: false, error: { code: 'not_backup' } });
    expect(parseBackup(file({ version: 2 }))).toEqual({
      ok: false,
      error: { code: 'newer_version', version: 2 },
    });
  });

  it('refuses malformed documents, so a restore never breaks balances', () => {
    const bad = (collection: BackupCollection, doc: unknown) =>
      parseBackup(file({ [collection]: [doc] }));
    expect(
      bad('transactions', {
        id: 't',
        type: 'expense',
        amount: 1.5,
        accountId: 'cash',
        date: '2026-09-01',
      }),
    ).toMatchObject({
      error: { code: 'invalid_document', collection: 'transactions', id: 't' },
    });
    expect(
      bad('transactions', {
        id: 't',
        type: 'gift',
        amount: 1,
        accountId: 'cash',
        date: '2026-09-01',
      }).ok,
    ).toBe(false);
    expect(
      bad('transactions', {
        id: 't',
        type: 'transfer',
        amount: 1,
        accountId: 'cash',
        date: '2026-09-01',
      }).ok,
    ).toBe(false);
    expect(bad('accounts', { id: 'a/b', name: 'X', currency: 'USD', openingBalance: 0 }).ok).toBe(
      false,
    );
    expect(bad('categories', { id: 'c', name: 'X', type: 'transfer' }).ok).toBe(false);
  });

  it('refuses transactions on accounts the file doesn’t include', () => {
    const result = parseBackup(
      file({
        transactions: [
          {
            id: 't1',
            type: 'transfer',
            amount: 1,
            accountId: 'cash',
            toAccountId: 'bank',
            date: '2026-09-01',
          },
        ],
      }),
    );
    expect(result).toEqual({ ok: false, error: { code: 'missing_account', id: 't1' } });
  });

  it('names the file with the local date', () => {
    expect(backupFileName('2026-09-28')).toBe('expensify-backup-2026-09-28.json');
  });
});
