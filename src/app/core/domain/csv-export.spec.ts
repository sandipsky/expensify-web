import { Transaction } from '../models/transaction';
import {
  CSV_HEADERS,
  ExportNames,
  csvRow,
  exportFileName,
  exportOrder,
  exportRecord,
} from './csv-export';

const at = (ms: number) => ({ toMillis: () => ms });

const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: 't',
  type: 'expense',
  amount: 1250,
  currency: 'USD',
  accountId: 'cash',
  accountIds: ['cash'],
  categoryId: 'lunch',
  date: '2026-09-25',
  time: '13:10',
  payee: 'Corner Cafe',
  note: null,
  tags: ['work'],
  source: 'web',
  createdAt: at(1),
  updatedAt: at(1),
  ...overrides,
});

const names: ExportNames = {
  account: (id) => ({ cash: 'Cash', bank: 'Bank' })[id ?? ''],
  category: (id) =>
    (
      ({
        food: { name: 'Food and dining', parentId: null },
        lunch: { name: 'Lunch', parentId: 'food' },
        salary: { name: 'Salary', parentId: null },
      }) as Record<string, { name: string; parentId: string | null }>
    )[id ?? ''],
};

describe('CSV export (DAT-01, Appendix B)', () => {
  it('has the Appendix B header', () => {
    expect(CSV_HEADERS.join(',')).toBe(
      'Date,Time,Type,Amount,Currency,Account,To account,Category,Subcategory,Payee,Note,Tags',
    );
  });

  it('writes the Appendix B example rows', () => {
    const rows = [
      tx({
        type: 'income',
        amount: 300000,
        accountId: 'bank',
        categoryId: 'salary',
        time: '09:00',
        payee: 'Employer Ltd',
        note: 'September salary',
        tags: [],
      }),
      tx({}),
      tx({
        type: 'transfer',
        amount: 20000,
        accountId: 'bank',
        toAccountId: 'cash',
        categoryId: null,
        date: '2026-09-26',
        time: null,
        payee: null,
        note: 'ATM withdrawal',
        tags: [],
      }),
    ].map((t) => csvRow(exportRecord(t, names)).join(','));
    expect(rows).toEqual([
      '2026-09-25,09:00,income,3000.00,USD,Bank,,Salary,,Employer Ltd,September salary,',
      '2026-09-25,13:10,expense,12.50,USD,Cash,,Food and dining,Lunch,Corner Cafe,,work',
      '2026-09-26,,transfer,200.00,USD,Bank,Cash,,,,ATM withdrawal,',
    ]);
  });

  it('joins tags with | and leaves names of deleted accounts and categories blank', () => {
    const record = exportRecord(
      tx({ accountId: 'gone', categoryId: 'gone', tags: ['a', 'b'] }),
      names,
    );
    expect(record).toMatchObject({ account: '', category: '', subcategory: '', tags: 'a|b' });
  });

  it('lists oldest first by date, then time (untimed first), then creation', () => {
    const txs = [
      tx({ id: 'c', date: '2026-09-02', time: '08:00', createdAt: at(5) }),
      tx({ id: 'b', date: '2026-09-02', time: null, createdAt: at(9) }),
      tx({ id: 'a', date: '2026-09-01', time: '23:00', createdAt: at(1) }),
      tx({ id: 'e', date: '2026-09-02', time: '08:00', createdAt: null }),
      tx({ id: 'd', date: '2026-09-02', time: '08:00', createdAt: at(7) }),
    ];
    expect(exportOrder(txs).map((t) => t.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('names the file after the period', () => {
    expect(exportFileName({ start: '2026-09-01', end: '2026-09-30' }, 'csv')).toBe(
      'transactions-2026-09-01-to-2026-09-30.csv',
    );
    expect(exportFileName(null, 'xlsx')).toBe('transactions-all.xlsx');
  });
});
