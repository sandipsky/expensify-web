import { Injectable, computed, inject, linkedSignal, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { map, switchMap } from 'rxjs';
import {
  DateRange,
  MAX_UNPAGED_DAYS,
  PERIOD_PRESETS,
  PeriodPreset,
  daysIn,
  monthPeriod,
  presetRange,
  sameRange,
} from '../../core/domain/period';
import {
  NO_FILTER,
  TransactionFilter,
  activeFilterCount,
  compareNewestFirst,
  filterTransactions,
  groupByDay,
  localDate,
  tagSuggestions,
  totalsOf,
  wholeDays,
} from '../../core/domain/transactions';
import { Transaction } from '../../core/models/transaction';
import { Preferences } from '../../core/preferences';
import { CategoriesStore } from '../categories/categories.store';
import { TransactionRows, TxRow } from './transaction-rows';
import { TransactionsStore } from './transactions.store';

/** A long period loads this many entries at a time (§8, LST-04). */
export const PAGE_SIZE = 50;

/** One day of the list: its header and its rows (LST-01). */
export interface TxDay {
  date: string;
  label: string;
  /** Income − expense for the day, without transfers and adjustments. */
  net: number;
  rows: TxRow[];
}

/**
 * The Transactions page's state: the period and its one listener (NFR-19), the
 * filters and search applied on the device (§8), totals, day groups and the
 * bulk selection. Provided by the page, so the listener stops when it closes.
 */
@Injectable()
export class TransactionListStore {
  private readonly store = inject(TransactionsStore);
  private readonly categories = inject(CategoriesStore);
  private readonly rows = inject(TransactionRows);
  private readonly monthStartDay = inject(Preferences).monthStartDay;

  readonly today = localDate();

  readonly preset = signal<PeriodPreset>('this_month');
  /** The range "Custom" shows; it starts as this month. */
  readonly custom = signal<DateRange>(monthPeriod(this.today, this.monthStartDay()));
  readonly range = computed(() =>
    presetRange(this.preset(), this.today, this.monthStartDay(), this.custom()),
  );
  /** Periods longer than a year load in pages (LST-04). */
  readonly paged = computed(() => daysIn(this.range()) > MAX_UNPAGED_DAYS);

  readonly filter = signal<TransactionFilter>(NO_FILTER);
  /** Filters set, not counting the search box. */
  readonly filterCount = computed(() => activeFilterCount(this.filter()));
  readonly filtering = computed(() => this.filterCount() > 0 || !!this.filter().search.trim());

  /** How many entries a paged period listens to; back to one page when the period changes. */
  private readonly limit = linkedSignal({ source: this.range, computation: () => PAGE_SIZE });

  private readonly page = toSignal(
    toObservable(
      computed(() => ({ range: this.range(), limit: this.paged() ? this.limit() : undefined })),
    ).pipe(
      switchMap(({ range, limit }) =>
        this.store.watchRange(range, limit).pipe(map((txs) => ({ limit, txs }))),
      ),
    ),
  );

  /** True until the period's first snapshot arrives; skeletons show only then. */
  readonly loading = computed(() => this.page() === undefined);
  /** A paged period with more to load. */
  readonly hasMore = computed(() => {
    const page = this.page();
    return !!page && page.limit !== undefined && page.txs.length >= page.limit;
  });

  /** The loaded entries, newest first by date, time and creation (§10). */
  readonly loaded = computed<Transaction[]>(() => {
    const page = this.page();
    return page ? wholeDays([...page.txs].sort(compareNewestFirst), this.hasMore()) : [];
  });

  private readonly categoriesById = computed(
    () => new Map(this.categories.all().map((c) => [c.id, c])),
  );

  /** What the filters and search let through (LST-02, LST-06, LST-07). */
  readonly visible = computed(() =>
    filterTransactions(this.loaded(), this.filter(), this.categoriesById()),
  );

  /** Income, expense and net of what's shown (LST-03, TXN-09, BR-12). */
  readonly totals = computed(() => totalsOf(this.visible()));

  readonly visibleRows = computed(() =>
    this.visible().map((tx) => this.rows.toRow(tx, this.today)),
  );

  readonly days = computed<TxDay[]>(() =>
    groupByDay(this.visibleRows()).map(({ date, items }) => ({
      date,
      label: this.rows.dayLabel(date, this.today),
      net: totalsOf(items.map((row) => row.tx)).net,
      rows: items,
    })),
  );

  /** Tags used in the loaded period, for the tag filter (LST-07). */
  readonly periodTags = computed(() => tagSuggestions(this.loaded()).sort());

  // Bulk selection (TXN-13). Entries filtered out stay out of the selection.
  readonly selecting = signal(false);
  private readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  readonly selected = computed(() => this.visible().filter((tx) => this.selectedIds().has(tx.id)));
  readonly allSelected = computed(
    () => this.visible().length > 0 && this.selected().length === this.visible().length,
  );

  setPreset(preset: PeriodPreset): void {
    this.preset.set(preset);
  }

  setCustom(range: DateRange): void {
    this.custom.set(range);
    this.preset.set('custom');
  }

  /** Shows `range`, under its preset when it is one (This month, Last month, This year). */
  showRange(range: DateRange): void {
    const preset = PERIOD_PRESETS.find(
      (p) =>
        p !== 'custom' &&
        sameRange(presetRange(p, this.today, this.monthStartDay(), this.custom()), range),
    );
    if (preset) this.setPreset(preset);
    else this.setCustom(range);
  }

  setSearch(search: string): void {
    this.filter.update((filter) => ({ ...filter, search }));
  }

  /** Keeps the search text; everything else comes from `filter`. */
  setFilter(filter: TransactionFilter): void {
    this.filter.update((current) => ({ ...filter, search: current.search }));
  }

  clearFilters(): void {
    this.filter.set(NO_FILTER);
  }

  loadMore(): void {
    if (this.hasMore()) this.limit.update((limit) => limit + PAGE_SIZE);
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggle(id: string): void {
    this.selectedIds.update((ids) => {
      const next = new Set(ids);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  toggleAll(): void {
    this.selectedIds.set(
      this.allSelected() ? new Set() : new Set(this.visible().map((tx) => tx.id)),
    );
  }

  startSelecting(): void {
    this.selecting.set(true);
  }

  stopSelecting(): void {
    this.selecting.set(false);
    this.selectedIds.set(new Set());
  }
}
