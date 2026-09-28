import { CSV_HEADERS } from './csv-export';
import {
  ImportContext,
  ImportMapping,
  categoriesToCreate,
  detectDateOrder,
  detectDecimalSeparator,
  duplicateKey,
  guessColumns,
  guessMapping,
  mappingGaps,
  markDuplicates,
  parseDate,
  parseTime,
  parseType,
  planImport,
  rowsToImport,
  unescapeCell,
} from './csv-import';

const context: ImportContext = {
  accounts: [
    { id: 'cash', name: 'Cash', currency: 'USD' },
    { id: 'bank', name: 'Bank', currency: 'USD' },
  ],
  categories: [
    { id: 'food', name: 'Food and dining', type: 'expense', parentId: null },
    { id: 'lunch', name: 'Lunch', type: 'expense', parentId: 'food' },
    { id: 'coffee', name: 'Coffee', type: 'expense', parentId: 'food' },
    { id: 'salary', name: 'Salary', type: 'income', parentId: null },
  ],
};

/** The Appendix B columns, as an export from either app maps itself. */
const appMapping: ImportMapping = {
  columns: guessColumns([...CSV_HEADERS]),
  dateOrder: 'ymd',
  decimalSeparator: '.',
  amountMode: 'signed',
  accountId: null,
};

const row = (values: Partial<Record<(typeof CSV_HEADERS)[number], string>>): string[] =>
  CSV_HEADERS.map((header) => values[header] ?? '');

describe('CSV import (DAT-02)', () => {
  describe('mapping', () => {
    it('maps Appendix B headers to their fields', () => {
      expect(guessColumns([...CSV_HEADERS])).toEqual({
        date: 0,
        time: 1,
        type: 2,
        amount: 3,
        currency: 4,
        account: 5,
        toAccount: 6,
        category: 7,
        subcategory: 8,
        payee: 9,
        note: 10,
        tags: 11,
      });
    });

    it("recognizes a bank's headers, each column once", () => {
      expect(guessColumns(['Posting Date', 'Description', 'Debit', 'Credit', 'Memo'])).toEqual({
        date: 0,
        payee: 1,
        moneyOut: 2,
        moneyIn: 3,
        note: 4,
      });
    });

    it('guesses split amounts, the date order and the decimal separator from the data', () => {
      const mapping = guessMapping(
        ['Date', 'Details', 'Paid out', 'Paid in'],
        [
          ['25.09.2026', 'Shop', '12,50', ''],
          ['03.09.2026', 'Wage', '', '1.500,00'],
        ],
        'mdy',
      );
      expect(mapping).toMatchObject({
        amountMode: 'split',
        dateOrder: 'dmy',
        decimalSeparator: ',',
      });
    });

    it('says what a mapping still needs', () => {
      expect(mappingGaps(appMapping)).toEqual([]);
      expect(mappingGaps({ ...appMapping, columns: {} })).toEqual(['date', 'amount', 'account']);
      expect(
        mappingGaps({
          ...appMapping,
          columns: { date: 0, moneyIn: 1 },
          amountMode: 'split',
          accountId: 'cash',
        }),
      ).toEqual([]);
    });
  });

  describe('cells', () => {
    it('reads dates in the order chosen, and a time in the same cell', () => {
      expect(parseDate('2026-09-25', 'ymd')).toEqual({ date: '2026-09-25', time: null });
      expect(parseDate('25/09/2026', 'dmy')?.date).toBe('2026-09-25');
      expect(parseDate('9/25/26', 'mdy')?.date).toBe('2026-09-25');
      expect(parseDate('2026-09-25T14:30:00Z', 'ymd')).toEqual({
        date: '2026-09-25',
        time: '14:30',
      });
      expect(parseDate('25.09.2026 08:05', 'dmy')).toEqual({ date: '2026-09-25', time: '08:05' });
      expect(parseDate('31/02/2026', 'dmy')).toBeNull();
      expect(parseDate('2026-09-25', 'dmy')).toBeNull();
      expect(parseDate('yesterday', 'ymd')).toBeNull();
    });

    it('detects the order that reads the most dates, preferring the locale on ties', () => {
      expect(detectDateOrder(['2026-09-25', ''], 'dmy')).toBe('ymd');
      expect(detectDateOrder(['25/09/2026', '03/04/2026'], 'mdy')).toBe('dmy');
      expect(detectDateOrder(['03/04/2026'], 'mdy')).toBe('mdy');
      expect(detectDateOrder(['2026-09-25', '2026-09-26', 'soon'], 'mdy')).toBe('ymd');
      expect(detectDateOrder(['13/13/2026'], 'dmy')).toBeNull();
    });

    it('reads times, 12-hour ones too', () => {
      expect(parseTime('9:05')).toBe('09:05');
      expect(parseTime('2:30 PM')).toBe('14:30');
      expect(parseTime('12:10 am')).toBe('00:10');
      expect(parseTime('14.30')).toBe('14:30');
      expect(parseTime('25:00')).toBeNull();
    });

    it('reads types as Appendix B and banks write them', () => {
      expect(parseType('Expense')).toBe('expense');
      expect(parseType('DEBIT')).toBe('expense');
      expect(parseType('credit')).toBe('income');
      expect(parseType('transfer')).toBe('transfer');
      expect(parseType('refund')).toBeNull();
    });

    it('detects a comma decimal only when no amount uses a dot one', () => {
      expect(detectDecimalSeparator(['12,50', '3,1'])).toBe(',');
      expect(detectDecimalSeparator(['12.50', '1,234.00'])).toBe('.');
      expect(detectDecimalSeparator(['1,234', '500'])).toBe('.');
    });

    it("takes off the ' an export puts before formula characters", () => {
      expect(unescapeCell("'=SUM(A1)")).toBe('=SUM(A1)');
      expect(unescapeCell("'-ATM")).toBe('-ATM');
      expect(unescapeCell("'quoted'")).toBe("'quoted'");
    });
  });

  describe('planImport', () => {
    it('reads an Appendix B export back into the transactions it came from', () => {
      const plan = planImport(
        [
          row({
            Date: '2026-09-25',
            Time: '13:10',
            Type: 'expense',
            Amount: '12.50',
            Currency: 'USD',
            Account: 'Cash',
            Category: 'Food and dining',
            Subcategory: 'Lunch',
            Payee: 'Corner Cafe',
            Tags: 'work|Team',
          }),
          row({
            Date: '2026-09-26',
            Type: 'transfer',
            Amount: '200.00',
            Account: 'bank',
            'To account': 'Cash',
            Note: 'ATM',
          }),
          row({
            Date: '2026-09-25',
            Time: '09:00',
            Type: 'income',
            Amount: '3000.00',
            Account: 'Bank',
            Category: 'Salary',
          }),
        ],
        appMapping,
        context,
      );
      expect(plan.rows.map((r) => r.errors)).toEqual([[], [], []]);
      expect(plan.rows.map((r) => r.line)).toEqual([2, 3, 4]);
      expect(plan.rows[0].tx).toEqual({
        type: 'expense',
        amount: 1250,
        currency: 'USD',
        accountId: 'cash',
        toAccountId: null,
        categoryId: 'lunch',
        date: '2026-09-25',
        time: '13:10',
        payee: 'Corner Cafe',
        note: null,
        tags: ['work', 'team'],
      });
      expect(plan.rows[1].tx).toMatchObject({
        type: 'transfer',
        accountId: 'bank',
        toAccountId: 'cash',
        categoryId: null,
      });
      expect(plan.rows[2].tx).toMatchObject({
        type: 'income',
        amount: 300000,
        categoryId: 'salary',
      });
      expect(plan.newCategories).toEqual([]);
      expect(plan.range).toEqual({ start: '2026-09-25', end: '2026-09-26' });
    });

    it('takes the direction from the sign, or from money in and out columns', () => {
      const signed = planImport(
        [
          ['2026-09-01', '-4.20', 'Cafe'],
          ['2026-09-02', '100', 'Refund'],
          ['2026-09-03', '0', 'x'],
        ],
        { ...appMapping, columns: { date: 0, amount: 1, payee: 2 }, accountId: 'cash' },
        context,
      );
      expect(signed.rows.map((r) => r.tx?.type ?? r.errors[0].code)).toEqual([
        'expense',
        'income',
        'amount_zero',
      ]);
      expect(signed.rows[0].tx?.amount).toBe(420);

      const split = planImport(
        [
          ['01/09/2026', '4,20', ''],
          ['02/09/2026', '', '100,00'],
          ['03/09/2026', '1', '2'],
        ],
        {
          columns: { date: 0, moneyOut: 1, moneyIn: 2 },
          dateOrder: 'dmy',
          decimalSeparator: ',',
          amountMode: 'split',
          accountId: 'bank',
        },
        context,
      );
      expect(split.rows.map((r) => r.tx?.type ?? r.errors[0].code)).toEqual([
        'expense',
        'income',
        'amount_both',
      ]);
      expect(split.rows[1].tx).toMatchObject({
        amount: 10000,
        accountId: 'bank',
        date: '2026-09-02',
      });
    });

    it('reports every problem of a row with the cell it is about', () => {
      const plan = planImport(
        [
          row({ Date: 'soon', Type: 'refund', Amount: 'lots', Account: 'Wallet' }),
          row({
            Date: '2026-09-01',
            Type: 'transfer',
            Amount: '5',
            Account: 'Cash',
            'To account': 'Cash',
          }),
          row({
            Date: '2026-09-01',
            Type: 'expense',
            Amount: '5',
            Currency: 'EUR',
            Account: 'Cash',
          }),
          row({ Date: '2026-09-01', Type: 'expense', Amount: '5.555', Account: 'Cash' }),
        ],
        appMapping,
        context,
      );
      expect(plan.rows[0].tx).toBeNull();
      expect(plan.rows[0].errors).toEqual([
        { code: 'date_invalid', value: 'soon' },
        { code: 'account_unknown', value: 'Wallet' },
        { code: 'type_invalid', value: 'refund' },
        { code: 'amount_invalid', value: 'lots' },
      ]);
      expect(plan.rows[1].errors).toEqual([{ code: 'same_account' }]);
      expect(plan.rows[2].errors).toEqual([{ code: 'currency_mismatch', value: 'EUR' }]);
      expect(plan.rows[3].errors).toEqual([{ code: 'amount_invalid', value: '5.555' }]);
      expect(plan.range).toBeNull();
    });

    it('uses the fallback account for rows without one, and skips empty rows', () => {
      const plan = planImport(
        [
          row({ Date: '2026-09-01', Type: 'expense', Amount: '1' }),
          row({}),
          row({ Date: '2026-09-02', Type: 'expense', Amount: '1' }),
        ],
        { ...appMapping, accountId: 'bank' },
        context,
      );
      expect(plan.rows.map((r) => [r.line, r.tx?.accountId])).toEqual([
        [2, 'bank'],
        [4, 'bank'],
      ]);
    });

    it('plans categories it doesn’t find, and puts entries without one in Uncategorized', () => {
      const plan = planImport(
        [
          row({
            Date: '2026-09-01',
            Type: 'expense',
            Amount: '1',
            Account: 'Cash',
            Category: 'Pets',
          }),
          row({
            Date: '2026-09-01',
            Type: 'expense',
            Amount: '1',
            Account: 'Cash',
            Category: 'pets',
            Subcategory: 'Vet',
          }),
          row({
            Date: '2026-09-01',
            Type: 'expense',
            Amount: '1',
            Account: 'Cash',
            Category: 'Food and dining',
            Subcategory: 'Snacks',
          }),
          row({
            Date: '2026-09-01',
            Type: 'expense',
            Amount: '1',
            Account: 'Cash',
            Category: 'coffee',
          }),
          row({ Date: '2026-09-01', Type: 'income', Amount: '1', Account: 'Cash' }),
        ],
        appMapping,
        context,
      );
      const ids = plan.rows.map((r) => r.tx?.categoryId);
      expect(ids[3]).toBe('coffee');
      expect(ids[4]).toBe('inc_uncategorized');
      expect(plan.newCategories.map((c) => [c.name, c.parentId, c.parentKey])).toEqual([
        ['Pets', null, null],
        ['Vet', null, ids[0]],
        ['Snacks', 'food', null],
      ]);
      expect(ids[1]).toBe(plan.newCategories[1].key);

      // Only what the imported rows use is created, parents before their subcategories.
      const vetOnly = plan.rows.filter((r) => r.tx?.categoryId === ids[1]);
      expect(categoriesToCreate(plan, vetOnly).map((c) => c.name)).toEqual(['Pets', 'Vet']);
    });

    it('shortens long payees and notes, with a warning', () => {
      const plan = planImport(
        [
          row({
            Date: '2026-09-01',
            Type: 'expense',
            Amount: '1',
            Account: 'Cash',
            Payee: 'p'.repeat(120),
            Time: 'noonish',
          }),
        ],
        appMapping,
        context,
      );
      expect(plan.rows[0].tx?.payee).toHaveLength(100);
      expect(plan.rows[0].tx?.time).toBeNull();
      expect(plan.rows[0].warnings.map((w) => w.code)).toEqual(['time_invalid', 'payee_shortened']);
    });
  });

  describe('duplicates', () => {
    const plan = () =>
      planImport(
        [
          row({
            Date: '2026-09-01',
            Type: 'expense',
            Amount: '3.50',
            Account: 'Cash',
            Payee: 'Cafe',
          }),
          row({
            Date: '2026-09-01',
            Type: 'expense',
            Amount: '3.50',
            Account: 'Cash',
            Payee: 'cafe ',
          }),
          row({
            Date: '2026-09-01',
            Type: 'expense',
            Amount: '3.50',
            Account: 'Bank',
            Payee: 'Cafe',
          }),
          row({ Date: 'bad', Amount: '1', Account: 'Cash' }),
        ],
        appMapping,
        context,
      ).rows;

    it('matches same date, amount, account and payee, ignoring case', () => {
      expect(
        duplicateKey({ date: '2026-09-01', amount: 350, accountId: 'cash', payee: ' CAFE' }),
      ).toBe(duplicateKey({ date: '2026-09-01', amount: 350, accountId: 'cash', payee: 'cafe' }));
    });

    it('lets each logged entry match one row only', () => {
      const logged = [{ date: '2026-09-01', amount: 350, accountId: 'cash', payee: 'Cafe' }];
      expect(markDuplicates(plan(), logged).map((r) => r.duplicate)).toEqual([
        true,
        false,
        false,
        false,
      ]);
      expect(markDuplicates(plan(), [...logged, ...logged]).map((r) => r.duplicate)).toEqual([
        true,
        true,
        false,
        false,
      ]);
    });

    it('imports rows without errors, and duplicates only when asked', () => {
      const rows = markDuplicates(plan(), [
        { date: '2026-09-01', amount: 350, accountId: 'cash', payee: 'Cafe' },
      ]);
      expect(rowsToImport(rows, true).map((r) => r.line)).toEqual([3, 4]);
      expect(rowsToImport(rows, false).map((r) => r.line)).toEqual([2, 3, 4]);
    });
  });
});
