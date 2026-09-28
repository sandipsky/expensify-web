import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NO_FILTER } from '../../core/domain/transactions';
import { NewTransaction } from '../../core/models/transaction';
import { Preferences } from '../../core/preferences';
import { XLSX_TYPE } from '../../shared/files/xlsx';
import { AccountsStore } from '../accounts/accounts.store';
import { CategoriesStore } from '../categories/categories.store';
import { TransactionExport } from './transaction-export';
import { TransactionsStore } from './transactions.store';

/** Files handed to the browser: jsdom can't make object URLs of its blobs or follow downloads. */
function captureDownloads() {
  const files: { name: string; blob: Blob }[] = [];
  const blobs = new Map<string, Blob>();
  const create = URL.createObjectURL;
  const revoke = URL.revokeObjectURL;
  URL.createObjectURL = (blob: Blob) => {
    const url = `blob:test/${blobs.size + 1}`;
    blobs.set(url, blob);
    return url;
  };
  URL.revokeObjectURL = () => {};
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    files.push({ name: this.download, blob: blobs.get(this.href)! });
  });
  const restore = () => {
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    click.mockRestore();
  };
  return { files, restore };
}

describe('TransactionExport (DAT-01, DAT-05)', () => {
  let downloads: ReturnType<typeof captureDownloads>;
  let exporter: TransactionExport;
  let cash: string;

  const add = (tx: Partial<NewTransaction>) =>
    TestBed.inject(TransactionsStore).add({
      type: 'expense',
      amount: 1250,
      currency: 'USD',
      accountId: cash,
      categoryId: 'exp_food',
      date: '2026-09-25',
      tags: [],
      ...tx,
    });

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Preferences,
          useValue: { locale: signal('en-US'), baseCurrency: signal('USD') },
        },
      ],
    });
    downloads = captureDownloads();
    cash = TestBed.inject(AccountsStore).create({
      name: 'Cash',
      type: 'cash',
      openingBalance: 0,
      creditLimit: null,
      includeInTotal: true,
    });
    TestBed.inject(CategoriesStore).seedDefaults();
    exporter = TestBed.inject(TransactionExport);
  });

  afterEach(() => downloads.restore());

  it('writes the period as Appendix B CSV, oldest first, with a byte-order mark', async () => {
    add({ date: '2026-09-26', time: '09:00', payee: 'Cafe, "Corner"', tags: ['work', 'team'] });
    add({ date: '2026-09-02', type: 'income', categoryId: 'inc_salary', amount: 300000 });
    add({ date: '2026-08-31', payee: 'Outside the period' });

    const count = await exporter.export({ start: '2026-09-01', end: '2026-09-30' }, 'csv');
    expect(count).toBe(2);
    const [file] = downloads.files;
    expect(file.name).toBe('transactions-2026-09-01-to-2026-09-30.csv');
    expect(file.blob.type).toBe('text/csv;charset=utf-8');
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect((await file.blob.text()).replace(/^﻿/, '').split('\r\n')).toEqual([
      'Date,Time,Type,Amount,Currency,Account,To account,Category,Subcategory,Payee,Note,Tags',
      '2026-09-02,,income,3000.00,USD,Cash,,Salary,,,,',
      '2026-09-26,09:00,expense,12.50,USD,Cash,,Food and dining,,"Cafe, ""Corner""",,work|team',
    ]);
  });

  it('keeps spreadsheets from running a cell as a formula', async () => {
    add({ payee: '=HYPERLINK("x")', note: '-5 off' });
    await exporter.export(null, 'csv');
    const text = await downloads.files[0].blob.text();
    expect(text).toContain(`'=HYPERLINK(""x"")`);
    expect(text).toContain(`'-5 off`);
    expect(downloads.files[0].name).toBe('transactions-all.csv');
  });

  it('exports only what a filter lets through, and makes no file for nothing', async () => {
    add({});
    add({ type: 'income', categoryId: 'inc_salary' });
    const range = { start: '2026-09-01', end: '2026-09-30' };
    expect(await exporter.export(range, 'csv', { ...NO_FILTER, type: 'income' })).toBe(1);
    expect(await exporter.export({ start: '2020-01-01', end: '2020-01-31' }, 'csv')).toBe(0);
    expect(downloads.files).toHaveLength(1);
  });

  it('writes an Excel workbook with the same columns', async () => {
    add({});
    expect(await exporter.export(null, 'xlsx')).toBe(1);
    const [file] = downloads.files;
    expect(file.name).toBe('transactions-all.xlsx');
    expect(file.blob.type).toBe(XLSX_TYPE);
    expect(file.blob.size).toBeGreaterThan(1000);
  });
});
