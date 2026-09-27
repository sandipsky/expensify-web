import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { parseISO } from 'date-fns';
import { combineLatest, map, switchMap } from 'rxjs';
import { TransactionsRepo } from '../../core/data/transactions.repo';
import { formatCompactMoney, formatMoney } from '../../core/domain/money';
import {
  DateRange,
  PERIOD_PRESETS,
  PeriodPreset,
  budgetYearPeriod,
  formatPeriod,
  inRange,
  monthPeriod,
  orderedRange,
  presetRange,
  sameRange,
  spanOf,
} from '../../core/domain/period';
import { PeriodSummary, recentMonths, yearMonths } from '../../core/domain/reports';
import { compareNewestFirst } from '../../core/domain/transactions';
import { CategoryType, SYSTEM_CATEGORY_IDS } from '../../core/models/category';
import { Transaction, TxType } from '../../core/models/transaction';
import { Preferences } from '../../core/preferences';
import { Today } from '../../core/today';
import { BarChartGroup, ChartSeries } from '../../shared/components/ui/chart';
import { AccountsStore } from '../accounts/accounts.store';
import { CategoriesStore } from '../categories/categories.store';
import { PeriodRow } from './period-table/period-table';
import { REPORT_VIEWS, ReportView } from './report-labels';

/** How many months the trend shows (RPT-02). */
export const TREND_MONTHS = 12;
/** How many past month periods and years the comparison offers (RPT-03). */
const COMPARE_MONTHS = 24;
const COMPARE_YEARS = 3;
/** How far back the yearly summary goes (RPT-05). */
const MAX_YEARS_BACK = 20;

/** A period the comparison can pick, keyed as `m-1` (last month) or `y0` (this year). */
export interface CompareOption {
  value: string;
  label: string;
  range: DateRange;
}

/** What a drill-down opens the transaction list on (RPT-04). */
export interface DrillDown {
  range: DateRange;
  type?: TxType;
  categoryIds?: readonly string[];
  accountId?: string;
  search?: string;
}

/** The report state kept in the URL, so a drill-down and Back return to the same report. */
export type ReportParam = 'view' | 'period' | 'from' | 'to' | 'type' | 'a' | 'b' | 'year';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const rangesEqual = (a: readonly DateRange[], b: readonly DateRange[]) =>
  a.length === b.length && a.every((range, i) => sameRange(range, b[i]));

/**
 * The Reports page's state (§3.10): which report, its period(s), and one
 * listener per period it reads, never more (NFR-19). The state lives in the
 * query string. Provided by the page, so the listeners stop when it closes.
 */
@Injectable()
export class ReportsStore {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly repo = inject(TransactionsRepo);
  private readonly categories = inject(CategoriesStore);
  private readonly accounts = inject(AccountsStore);
  private readonly prefs = inject(Preferences);

  /** Reports use the base currency until multi-currency (§8). */
  readonly currency = this.prefs.baseCurrency;
  readonly locale = this.prefs.locale;
  readonly today = inject(Today).date;
  private readonly startDay = this.prefs.monthStartDay;

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  private param(key: ReportParam): string | null {
    return this.params().get(key);
  }

  readonly view = computed<ReportView>(() => {
    const view = this.param('view') as ReportView;
    return REPORT_VIEWS.includes(view) ? view : 'categories';
  });

  /** The period of the Categories, Cash flow and Payees reports. */
  readonly preset = computed<PeriodPreset>(() => {
    const preset = this.param('period') as PeriodPreset;
    return PERIOD_PRESETS.includes(preset) ? preset : 'this_month';
  });
  readonly custom = computed<DateRange>(
    () => {
      const from = this.param('from');
      const to = this.param('to');
      return from && to && DATE.test(from) && DATE.test(to)
        ? orderedRange(from, to)
        : monthPeriod(this.today(), this.startDay());
    },
    { equal: sameRange },
  );
  readonly range = computed(
    () => presetRange(this.preset(), this.today(), this.startDay(), this.custom()),
    { equal: sameRange },
  );
  readonly periodLabel = computed(() => formatPeriod(this.range(), this.locale()));

  /** Expense or income, for the Categories and Compare reports. */
  readonly type = computed<CategoryType>(() =>
    this.param('type') === 'income' ? 'income' : 'expense',
  );

  /** Month periods, newest first, then years (RPT-03). */
  readonly compareOptions = computed<CompareOption[]>(() => {
    const today = this.today();
    const day = this.startDay();
    const option = (value: string, range: DateRange, name?: string): CompareOption => ({
      value,
      range,
      label: name
        ? `${name} · ${formatPeriod(range, this.locale())}`
        : formatPeriod(range, this.locale()),
    });
    return [
      ...Array.from({ length: COMPARE_MONTHS }, (_, i) =>
        option(`m${-i}`, monthPeriod(today, day, -i), ['This month', 'Last month'][i]),
      ),
      ...Array.from({ length: COMPARE_YEARS }, (_, i) =>
        option(`y${-i}`, budgetYearPeriod(today, day, -i), ['This year', 'Last year'][i]),
      ),
    ];
  });
  /** The earlier period of the comparison; last month unless picked. */
  readonly compareA = computed(() => this.compareOption(this.param('a'), 'm-1'));
  /** The later period; this month unless picked. */
  readonly compareB = computed(() => this.compareOption(this.param('b'), 'm0'));

  /** The yearly summary's year: 0 for this one, −1 for last year … (RPT-05). */
  readonly yearOffset = computed(() => {
    const offset = Math.trunc(Number(this.param('year') ?? 0));
    return Number.isFinite(offset) ? Math.min(0, Math.max(-MAX_YEARS_BACK, offset)) : 0;
  });
  readonly yearMonths = computed(() =>
    yearMonths(this.today(), this.startDay(), this.yearOffset()),
  );
  readonly canGoBackAYear = computed(() => this.yearOffset() > -MAX_YEARS_BACK);
  /** "2026", or "25 Dec 2025 – 24 Dec 2026" when months start on another day (BR-05). */
  readonly yearLabel = computed(() => formatPeriod(spanOf(this.yearMonths())!, this.locale()));

  /** The current month period and the eleven before it, oldest first (RPT-02). */
  readonly trendMonths = computed(() => recentMonths(this.today(), this.startDay(), TREND_MONTHS));

  /** The ranges the current report reads: one listener each (NFR-19). */
  private readonly request = computed<DateRange[]>(
    () => {
      switch (this.view()) {
        case 'trend':
          return [spanOf(this.trendMonths())!];
        case 'year':
          return [spanOf(this.yearMonths())!];
        case 'compare':
          return [this.compareA().range, this.compareB().range];
        default:
          return [this.range()];
      }
    },
    { equal: rangesEqual },
  );

  private readonly data = toSignal(
    toObservable(this.request).pipe(
      switchMap((ranges) =>
        combineLatest(ranges.map((range) => this.repo.watchRange(range))).pipe(
          map((lists) => ({
            ranges,
            lists: lists.map((txs) => [...txs].sort(compareNewestFirst)),
          })),
        ),
      ),
    ),
  );

  /** True until the report's periods, categories and accounts have loaded; skeletons show only then. */
  readonly loading = computed(() => {
    const data = this.data();
    return (
      !data ||
      !rangesEqual(data.ranges, this.request()) ||
      this.categories.loading() ||
      this.accounts.loading()
    );
  });

  /** The entries of the report's first period, newest first; empty while loading. */
  readonly txs = computed<Transaction[]>(() => (this.loading() ? [] : this.data()!.lists[0]));
  /** The comparison's two periods' entries: [earlier, later]. */
  readonly compareTxs = computed<[Transaction[], Transaction[]]>(() =>
    this.loading() || this.view() !== 'compare'
      ? [[], []]
      : [this.data()!.lists[0], this.data()!.lists[1]],
  );

  /** Full amounts, for values and tooltips. A stable function for the charts. */
  readonly money = (minor: number) => formatMoney(minor, this.currency(), this.locale());
  /** Signed amounts: +Rs 12.00, −Rs 5.00. */
  readonly signedMoney = (minor: number) =>
    formatMoney(minor, this.currency(), this.locale(), 'exceptZero');
  /** Short amounts, for chart axes and captions. */
  readonly compactMoney = (minor: number) =>
    formatCompactMoney(minor, this.currency(), this.locale());

  /** Income and expense bars, in the income and expense colors, with a legend and signs elsewhere (NFR-09). */
  readonly flowSeries: readonly ChartSeries[] = [
    { key: 'income', label: 'Income', color: 'var(--success)' },
    { key: 'expense', label: 'Expense', color: 'var(--error)' },
  ];

  /** Each period as a group of income and expense bars, with its net under the label. */
  toGroups(summaries: readonly PeriodSummary[]): BarChartGroup[] {
    return summaries.map((s) => ({
      key: s.range.start,
      label: this.shortMonth(s.range),
      title: formatPeriod(s.range, this.locale()),
      values: { income: s.income, expense: s.expense },
      caption: formatCompactMoney(s.net, this.currency(), this.locale(), 'exceptZero'),
    }));
  }

  /** Each period as a table row; the one containing today is marked. */
  toRows(summaries: readonly PeriodSummary[]): PeriodRow[] {
    const today = this.today();
    return summaries.map((s) => ({
      key: s.range.start,
      label: formatPeriod(s.range, this.locale()),
      shortLabel: this.shortPeriod(s.range),
      summary: s,
      current: inRange(today, s.range),
    }));
  }

  /** "Sep 2026" for a calendar month, "Aug 25, 2026" (its first day) otherwise. */
  shortPeriod(range: DateRange): string {
    const options: Intl.DateTimeFormatOptions = range.start.endsWith('-01')
      ? { month: 'short', year: 'numeric' }
      : { day: 'numeric', month: 'short', year: 'numeric' };
    return new Intl.DateTimeFormat(this.locale(), options).format(parseISO(range.start));
  }

  /** "Sep" for a calendar month, "25 Aug" otherwise, since that month doesn't have one name (BR-05). */
  shortMonth(range: DateRange): string {
    const start = parseISO(range.start);
    const options: Intl.DateTimeFormatOptions = range.start.endsWith('-01')
      ? { month: 'short' }
      : { day: 'numeric', month: 'short' };
    return new Intl.DateTimeFormat(this.locale(), options).format(start);
  }

  /** How a category appears in reports: its name, icon and color; system names when not seeded. */
  categoryView(id: string): { name: string; icon: string; color: string | null } {
    const category = this.categories.byId(id);
    if (category)
      return { name: this.categories.path(category), icon: category.icon, color: category.color };
    const uncategorized = [
      SYSTEM_CATEGORY_IDS.expense.uncategorized,
      SYSTEM_CATEGORY_IDS.income.uncategorized,
      '',
    ].includes(id);
    return {
      name: uncategorized ? 'Uncategorized' : 'Deleted category',
      icon: 'help',
      color: null,
    };
  }

  accountView(id: string): { name: string; icon: string; color: string | null } {
    const account = this.accounts.byId(id);
    return account
      ? { name: account.name, icon: account.icon, color: account.color }
      : { name: 'Deleted account', icon: 'help', color: null };
  }

  /** Changes the report's state in the URL, keeping the rest. `null` removes a parameter. */
  set(changes: Partial<Record<ReportParam, string | number | null>>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: changes,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Opens the transaction list on the entries behind a figure (RPT-04). */
  drillDown(target: DrillDown): void {
    void this.router.navigate(['/transactions'], {
      queryParams: {
        from: target.range.start,
        to: target.range.end,
        type: target.type,
        category: target.categoryIds?.length ? target.categoryIds.join(',') : undefined,
        account: target.accountId,
        q: target.search,
      },
    });
  }

  private compareOption(value: string | null, fallback: string): CompareOption {
    const options = this.compareOptions();
    return options.find((o) => o.value === value) ?? options.find((o) => o.value === fallback)!;
  }
}
