import { Injectable, inject } from '@angular/core';
import { TransactionsRepo } from '../../core/data/transactions.repo';
import {
  CSV_HEADERS,
  ExportNames,
  ExportRecord,
  csvRow,
  exportFileName,
  exportOrder,
  exportRecord,
} from '../../core/domain/csv-export';
import { fractionDigits, toMajorUnits } from '../../core/domain/money';
import { DateRange } from '../../core/domain/period';
import { TransactionFilter, filterTransactions } from '../../core/domain/transactions';
import { saveFile } from '../../shared/files/download';
import { XlsxCell, xlsx } from '../../shared/files/xlsx';
import { AccountsStore } from '../accounts/accounts.store';
import { CategoriesStore } from '../categories/categories.store';
import { SYSTEM_CATEGORY_NAMES } from './transaction-rows';

export type ExportFormat = 'csv' | 'xlsx';

/** Column widths of the Excel sheet, in characters, in Appendix B's order. */
const XLSX_WIDTHS = [12, 7, 10, 14, 9, 18, 18, 22, 18, 28, 40, 20];

/**
 * Saves transactions as a file on the device: CSV in the Appendix B format
 * (DAT-01) or an Excel workbook with the same columns, typed (DAT-05). Reads
 * the period once, like any list, so it works offline from the cache.
 */
@Injectable({ providedIn: 'root' })
export class TransactionExport {
  private readonly repo = inject(TransactionsRepo);
  private readonly accounts = inject(AccountsStore);
  private readonly categories = inject(CategoriesStore);

  /**
   * Exports the range's transactions, every one without a range. With a
   * filter, only those the list shows with it. Resolves to how many went into
   * the file; with none, no file is made.
   */
  async export(
    range: DateRange | null,
    format: ExportFormat,
    filter?: TransactionFilter,
  ): Promise<number> {
    let txs = await this.repo.listRange(range);
    if (filter) {
      const byId = new Map(this.categories.all().map((c) => [c.id, c]));
      txs = filterTransactions(txs, filter, byId);
    }
    if (!txs.length) return 0;
    const records = exportOrder(txs).map((tx) => exportRecord(tx, this.names));
    const blob = format === 'csv' ? await csvFile(records) : xlsxFile(records);
    saveFile(blob, exportFileName(range, format));
    return records.length;
  }

  private readonly names: ExportNames = {
    account: (id) => (id ? this.accounts.byId(id)?.name : undefined),
    category: (id) =>
      this.categories.byId(id) ??
      (id && SYSTEM_CATEGORY_NAMES[id]
        ? { name: SYSTEM_CATEGORY_NAMES[id], parentId: null }
        : undefined),
  };
}

/**
 * UTF-8 with a byte-order mark and CRLF line ends, so Excel opens it right
 * (Appendix B). Cells starting with `=`, `+`, `-` or `@` get a leading `'`, so a
 * spreadsheet shows them instead of running them; imports take it off again.
 * PapaParse loads only when a CSV is made.
 */
async function csvFile(records: readonly ExportRecord[]): Promise<Blob> {
  const { unparse } = await import('papaparse');
  const text = unparse(
    { fields: [...CSV_HEADERS], data: records.map(csvRow) },
    { newline: '\r\n', escapeFormulae: true },
  );
  return new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
}

/** The same columns with real dates, times and numbers, amounts in major units. */
function xlsxFile(records: readonly ExportRecord[]): Blob {
  const rows: XlsxCell[][] = [
    [...CSV_HEADERS],
    ...records.map((r) => [
      { date: r.date },
      r.time ? { time: r.time } : null,
      r.type,
      { value: toMajorUnits(r.amount, r.currency), decimals: fractionDigits(r.currency) },
      r.currency,
      r.account,
      r.toAccount,
      r.category,
      r.subcategory,
      r.payee,
      r.note,
      r.tags,
    ]),
  ];
  return xlsx([{ name: 'Transactions', widths: XLSX_WIDTHS, rows }]);
}
