import { Injectable, computed, inject, signal } from '@angular/core';
import { TransactionsRepo } from '../../../core/data/transactions.repo';
import {
  DateOrder,
  ImportField,
  ImportMapping,
  categoriesToCreate,
  guessMapping,
  mappingGaps,
  markDuplicates,
  planImport,
  rowsToImport,
} from '../../../core/domain/csv-import';
import { DateRange } from '../../../core/domain/period';
import { Transaction } from '../../../core/models/transaction';
import { Preferences } from '../../../core/preferences';
import { readText } from '../../../shared/files/download';
import { AccountsStore } from '../../accounts/accounts.store';
import { CategoriesStore } from '../../categories/categories.store';

/** Upload → map columns → preview → done (§13 Import). */
export type ImportStep = 0 | 1 | 2 | 3;

/** More rows than this are refused: split the file (keeps the preview quick, NFR-04). */
export const MAX_IMPORT_ROWS = 20_000;

/** What went wrong reading a file, for the upload step to word. */
export type FileProblem = 'unreadable' | 'empty' | 'too_many';

export interface ImportResult {
  count: number;
  categories: number;
  range: DateRange | null;
}

const EMPTY_MAPPING: ImportMapping = {
  columns: {},
  dateOrder: 'ymd',
  decimalSeparator: '.',
  amountMode: 'signed',
  accountId: null,
};

/**
 * The CSV import's state (DAT-02): the parsed file, how its columns map, the
 * rows read with it, which of them are already logged, and the write.
 * Provided by the import page, so it's gone once the page closes.
 */
@Injectable()
export class ImportStore {
  private readonly accounts = inject(AccountsStore);
  private readonly categories = inject(CategoriesStore);
  private readonly repo = inject(TransactionsRepo);
  private readonly locale = inject(Preferences).locale;

  readonly step = signal<ImportStep>(0);
  readonly fileName = signal('');
  /** Every row of the file, the header row included. */
  private readonly records = signal<string[][]>([]);
  readonly hasHeader = signal(true);
  readonly mapping = signal<ImportMapping>(EMPTY_MAPPING);
  readonly skipDuplicates = signal(true);
  /** Entries already logged in the file's dates; null until looked up. */
  private readonly existing = signal<Transaction[] | null>(null);
  readonly checking = signal(false);
  readonly result = signal<ImportResult | null>(null);

  readonly headers = computed(() => {
    const first = this.records()[0] ?? [];
    return first.map((cell, i) =>
      this.hasHeader() && cell.trim() ? cell.trim() : `Column ${i + 1}`,
    );
  });
  readonly dataRows = computed(() => (this.hasHeader() ? this.records().slice(1) : this.records()));

  /** Columns for the mapping pickers, each with a value from the file to recognize it by. */
  readonly columnItems = computed(() =>
    this.headers().map((header, i) => {
      const sample =
        this.dataRows()
          .find((row) => row[i]?.trim())
          ?.[i]?.trim() ?? '';
      return {
        value: i,
        label: sample ? `${header} · ${truncate(sample, 24)}` : header,
      };
    }),
  );

  readonly gaps = computed(() => mappingGaps(this.mapping()));

  readonly plan = computed(() =>
    planImport(
      this.dataRows(),
      this.mapping(),
      { accounts: this.accounts.all(), categories: this.categories.all() },
      this.hasHeader() ? 2 : 1,
    ),
  );
  readonly rows = computed(() => {
    const existing = this.existing();
    return existing ? markDuplicates(this.plan().rows, existing) : this.plan().rows;
  });
  readonly toImport = computed(() => rowsToImport(this.rows(), this.skipDuplicates()));
  readonly newCategories = computed(() => categoriesToCreate(this.plan(), this.toImport()));
  readonly counts = computed(() => {
    const rows = this.rows();
    return {
      total: rows.length,
      ready: this.toImport().length,
      duplicates: rows.filter((r) => r.tx && r.duplicate).length,
      errors: rows.filter((r) => !r.tx).length,
      warnings: rows.filter((r) => r.tx && r.warnings.length).length,
    };
  });

  /** Reads and parses a picked file; resolves to what's wrong with it, or null. */
  async load(file: Blob, name: string): Promise<FileProblem | null> {
    let text: string;
    try {
      text = (await readText(file)).replace(/^﻿/, '');
    } catch {
      return 'unreadable';
    }
    const { parse } = await import('papaparse');
    const parsed = parse<string[]>(text, { skipEmptyLines: 'greedy' });
    // A header and at least one row.
    const records = parsed.data.filter((row) => Array.isArray(row));
    if (records.length < 2) return 'empty';
    if (records.length > MAX_IMPORT_ROWS + 1) return 'too_many';

    this.fileName.set(name);
    this.records.set(records);
    this.hasHeader.set(true);
    this.existing.set(null);
    this.result.set(null);
    this.mapping.set({
      ...guessMapping(this.headers(), this.dataRows(), preferredDateOrder(this.locale())),
      accountId: this.accounts.active().length === 1 ? this.accounts.active()[0].id : null,
    });
    this.step.set(1);
    return null;
  }

  setHasHeader(hasHeader: boolean): void {
    this.hasHeader.set(hasHeader);
    this.existing.set(null);
    this.mapping.update((m) =>
      hasHeader
        ? { ...guessMapping(this.headers(), this.dataRows(), m.dateOrder), accountId: m.accountId }
        : m,
    );
  }

  /** Points a field at a column, or at none; a column fills one field at most. */
  setColumn(field: ImportField, column: number | null): void {
    this.existing.set(null);
    this.mapping.update((m) => {
      const columns = { ...m.columns };
      for (const [key, value] of Object.entries(columns)) {
        if (value === column) delete columns[key as ImportField];
      }
      if (column === null) delete columns[field];
      else columns[field] = column;
      return { ...m, columns };
    });
  }

  update(changes: Partial<Omit<ImportMapping, 'columns'>>): void {
    this.existing.set(null);
    this.mapping.update((m) => ({ ...m, ...changes }));
  }

  /** Moves on to the preview, looking up entries already logged in the file's dates. */
  async review(): Promise<void> {
    if (this.gaps().length) return;
    this.step.set(2);
    const range = this.plan().range;
    if (!range) {
      this.existing.set([]);
      return;
    }
    this.checking.set(true);
    try {
      this.existing.set(await this.repo.listRange(range));
    } finally {
      this.checking.set(false);
    }
  }

  /**
   * Writes the rows to import: new categories first, then the entries in
   * batches with their balance increments (§4), `source: 'import'`. Not
   * awaited, like every write (NFR-03).
   */
  import(): ImportResult {
    const rows = this.toImport();
    const ids = this.categories.createPlanned(this.newCategories());
    const txs = rows.map((row) => {
      const tx = row.tx!;
      const categoryId = tx.categoryId ? (ids.get(tx.categoryId) ?? tx.categoryId) : null;
      return { ...tx, categoryId };
    });
    this.repo.addMany(txs, 'import');
    const dates = txs.map((tx) => tx.date).sort();
    const result: ImportResult = {
      count: txs.length,
      categories: ids.size,
      range: dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null,
    };
    this.result.set(result);
    this.step.set(3);
    return result;
  }

  reset(): void {
    this.records.set([]);
    this.fileName.set('');
    this.mapping.set(EMPTY_MAPPING);
    this.existing.set(null);
    this.result.set(null);
    this.skipDuplicates.set(true);
    this.step.set(0);
  }
}

/** How the user's locale writes dates, to read ambiguous ones like 03/04/2026 (DAT-02). */
export function preferredDateOrder(locale: string): DateOrder {
  try {
    const order = new Intl.DateTimeFormat(locale)
      .formatToParts(new Date(2026, 8, 25))
      .map((p) => p.type)
      .filter((t) => t === 'year' || t === 'month' || t === 'day')
      .map((t) => t[0])
      .join('');
    return order === 'ymd' || order === 'mdy' ? order : 'dmy';
  } catch {
    return 'dmy';
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
