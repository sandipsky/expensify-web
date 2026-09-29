import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { addDays, format, parseISO } from 'date-fns';
import { combineLatest, map, switchMap } from 'rxjs';
import { TransactionsRepo } from '../../core/data/transactions.repo';
import { BudgetProgress } from '../../core/domain/budget';
import { formatCompactMoney, formatMoney } from '../../core/domain/money';
import {
  DateRange,
  formatPeriod,
  inRange,
  isCalendarMonth,
  monthPeriod,
  orderedRange,
  previousRanges,
  sameRange,
} from '../../core/domain/period';
import { upcomingDates } from '../../core/domain/recurrence';
import {
  CategoryTotal,
  PeriodSummary,
  SummaryChange,
  categoryTotals,
  largestExpenses,
  periodSummaries,
  shareOf,
  summaryChange,
  summaryOf,
  topAndOther,
} from '../../core/domain/reports';
import { compareNewestFirst, isAdjustment } from '../../core/domain/transactions';
import { Budget } from '../../core/models/budget';
import { SYSTEM_CATEGORY_IDS } from '../../core/models/category';
import { Transaction, TxType } from '../../core/models/transaction';
import { Preferences } from '../../core/preferences';
import { Today } from '../../core/today';
import { BarChartGroup, ChartSeries, DonutSegment } from '../../shared/components/ui/chart';
import { AccountsStore } from '../accounts/accounts.store';
import { BudgetsStore } from '../budgets/budgets.store';
import { CategoriesStore } from '../categories/categories.store';
import { RecurringStore, RuleView } from '../recurring/recurring.store';
import { MASKED_AMOUNT } from '../transactions/transaction-amount/transaction-amount';
import { TransactionRows, TxRow, withDate } from '../transactions/transaction-rows';
import { DASHBOARD_PRESETS, DashboardPreset, PERIOD_CARDS } from './dashboard-labels';
import { DashboardLayout } from './dashboard-layout';

/** The trend shows the selected period and the five before it (DSH-04). */
export const TREND_PERIODS = 6;
/** Slices before the rest folds into "Other" (§3.7 card 4). */
export const TOP_CATEGORIES = 5;
/** Budgets on the card before "See all" (§3.7 card 5). */
export const TOP_BUDGETS = 5;
/** Entries on the recent card (DSH-05). */
export const RECENT_COUNT = 5;
/** Expenses on the largest card (DSH-15). */
export const LARGEST_COUNT = 3;
/** How far ahead the upcoming card looks (DSH-08). */
export const UPCOMING_DAYS = 7;

/** Key of the donut's "Other" slice. */
export const OTHER = 'other';
/** Neutral for "Other" and entries without a category, so no category's color is borrowed. */
const NEUTRAL = 'var(--text-quaternary)';

/** One row of the spending card: a category, or "Other" for the rest. */
export interface SpendingRow {
  key: string;
  /** The category IDs the row stands for; "Other" holds several. */
  categoryIds: string[];
  name: string;
  icon: string;
  color: string | null;
  amount: number;
  count: number;
  share: number | null;
}

/** One budget on the card with its current figures (DSH-07). */
export interface BudgetRow {
  budget: Budget;
  progress: BudgetProgress | undefined;
}

/** One recurring occurrence in the next days (DSH-08). */
export interface UpcomingRow {
  key: string;
  view: RuleView;
  date: string;
  /** The rule's next date, and due by today: an ask-first rule can be confirmed or skipped (REC-04). */
  due: boolean;
}

/** What a drill-down opens the transaction list on (DSH-11). */
export interface DrillDown {
  range: DateRange;
  type?: TxType;
  categoryIds?: readonly string[];
}

/** The dashboard state kept in the URL, so Back from a drill-down returns to the same period. */
export type DashboardParam = 'period' | 'from' | 'to';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const rangesEqual = (a: readonly DateRange[], b: readonly DateRange[]) =>
  a.length === b.length && a.every((range, i) => sameRange(range, b[i]));

/**
 * The dashboard's state (§3.7): the selected period, one listener on it and
 * one range query over the five periods before it (DSH-14), and every card's
 * figures from the shared domain functions (BR-01, BR-11). Accounts, budgets
 * and recurring rules come from the listeners the app already holds. Provided
 * by the page, so the listeners stop when it closes.
 */
@Injectable()
export class DashboardStore {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly repo = inject(TransactionsRepo);
  private readonly categories = inject(CategoriesStore);
  private readonly accounts = inject(AccountsStore);
  private readonly budgets = inject(BudgetsStore);
  private readonly rules = inject(RecurringStore);
  private readonly rows = inject(TransactionRows);
  private readonly prefs = inject(Preferences);
  readonly layout = inject(DashboardLayout);

  /** Figures are in the base currency until multi-currency (§8). */
  readonly currency = this.prefs.baseCurrency;
  readonly locale = this.prefs.locale;
  readonly today = inject(Today).date;
  private readonly startDay = this.prefs.monthStartDay;

  /** Privacy mode (DSH-09): every amount reads as ••••. */
  readonly masked = this.layout.privacy;

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  private param(key: DashboardParam): string | null {
    return this.params().get(key);
  }

  readonly preset = computed<DashboardPreset>(() => {
    const preset = this.param('period') as DashboardPreset;
    return DASHBOARD_PRESETS.includes(preset) ? preset : 'this_month';
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
  /** The selected period (DSH-06, BR-05). */
  readonly range = computed(
    () => {
      switch (this.preset()) {
        case 'this_month':
          return monthPeriod(this.today(), this.startDay());
        case 'last_month':
          return monthPeriod(this.today(), this.startDay(), -1);
        case 'custom':
          return this.custom();
      }
    },
    { equal: sameRange },
  );
  /** "September 2026", or the date range when months start on another day (BR-05). */
  readonly periodLabel = computed(() => formatPeriod(this.range(), this.locale()));

  /**
   * The selected period and the five before it, oldest first (DSH-04): month
   * periods for the presets, ranges of the same length for a custom range.
   */
  readonly periods = computed<DateRange[]>(() => {
    const preset = this.preset();
    if (preset === 'custom') {
      return [...previousRanges(this.range(), TREND_PERIODS - 1), this.range()];
    }
    const last = preset === 'this_month' ? 0 : -1;
    return Array.from({ length: TREND_PERIODS }, (_, i) =>
      monthPeriod(this.today(), this.startDay(), last - (TREND_PERIODS - 1) + i),
    );
  });
  /** The period the summary cards compare with (DSH-10). */
  readonly previous = computed(() => this.periods()[TREND_PERIODS - 2], { equal: sameRange });
  /** One range over the five earlier periods: they end the day before the selected one starts. */
  private readonly earlierRange = computed<DateRange>(
    () => ({
      start: this.periods()[0].start,
      end: format(addDays(parseISO(this.range().start), -1), 'yyyy-MM-dd'),
    }),
    { equal: sameRange },
  );

  /** The two ranges the page reads: one listener each, never one per card (DSH-14, NFR-19). */
  private readonly request = computed<DateRange[]>(() => [this.range(), this.earlierRange()], {
    equal: rangesEqual,
  });

  private readonly data = toSignal(
    toObservable(this.request).pipe(
      switchMap((ranges) =>
        combineLatest(ranges.map((range) => this.repo.watchRange(range))).pipe(
          map((lists) => ({ ranges, lists })),
        ),
      ),
    ),
  );

  /** True until the period's entries and the stores the cards name things from have loaded. */
  readonly loading = computed(() => {
    const data = this.data();
    return (
      !data ||
      !rangesEqual(data.ranges, this.request()) ||
      this.categories.loading() ||
      this.accounts.loading() ||
      this.budgets.loading()
    );
  });

  /** The selected period's entries, newest first; empty while loading. */
  readonly txs = computed<Transaction[]>(() =>
    this.loading() ? [] : [...this.data()!.lists[0]].sort(compareNewestFirst),
  );
  /** The five earlier periods' entries. */
  private readonly earlier = computed<Transaction[]>(() =>
    this.loading() ? [] : this.data()!.lists[1],
  );

  /** The period has no entries at all: one page-level empty state stands in for the period cards (DSH-13). */
  readonly empty = computed(() => !this.loading() && !this.txs().length);
  /** The cards to show, in the user's order (DSH-16), minus the period cards when the period is empty. */
  readonly cards = computed(() =>
    this.empty()
      ? this.layout.visible().filter((card) => !PERIOD_CARDS.includes(card))
      : this.layout.visible(),
  );

  // Summary (DSH-01, DSH-10)

  readonly summary = computed<PeriodSummary>(() => summaryOf(this.range(), this.txs()));
  private readonly previousTxs = computed(() =>
    this.earlier().filter((tx) => inRange(tx.date, this.previous())),
  );
  /** The change from the previous period, or null when it had no income or expense entries. */
  readonly change = computed<SummaryChange | null>(() => {
    const before = this.previousTxs();
    if (!before.some((tx) => tx.type !== 'transfer' && !isAdjustment(tx))) return null;
    return summaryChange(summaryOf(this.previous(), before), this.summary());
  });

  // Spending by category (DSH-03, DSH-12)

  private readonly categoriesById = computed(
    () => new Map(this.categories.all().map((c) => [c.id, c])),
  );
  private readonly totals = computed(() =>
    categoryTotals(this.txs(), 'expense', this.categoriesById()),
  );
  readonly spent = computed(() => this.totals().reduce((sum, t) => sum + t.amount, 0));
  readonly spentCount = computed(() => this.totals().reduce((sum, t) => sum + t.count, 0));
  /** The top categories and "Other" (only when it would hold two or more), each with its share. */
  readonly spending = computed<SpendingRow[]>(() => {
    const totals = this.totals();
    const keep = totals.length <= TOP_CATEGORIES + 1 ? totals.length : TOP_CATEGORIES;
    const { top, other } = topAndOther(totals, keep);
    const rows = top.map((t) => this.spendingRow(t));
    if (other) {
      rows.push({
        key: OTHER,
        categoryIds: other.categoryIds.filter(Boolean),
        name: 'Other',
        icon: 'category',
        color: null,
        amount: other.amount,
        count: other.count,
        share: shareOf(other.amount, this.spent()),
      });
    }
    return rows;
  });
  readonly segments = computed<DonutSegment[]>(() =>
    this.spending().map((row) => ({
      key: row.key,
      label: row.name,
      value: row.amount,
      color: row.color ?? NEUTRAL,
    })),
  );

  // Budgets (DSH-07)

  /** Active budgets, most used first (a zero limit counts as fully used), at most TOP_BUDGETS. */
  readonly budgetRows = computed<BudgetRow[]>(() =>
    this.budgets
      .active()
      .map((budget) => ({ budget, progress: this.budgets.progressOf(budget) }))
      .sort((a, b) => usedOf(b.progress) - usedOf(a.progress))
      .slice(0, TOP_BUDGETS),
  );
  readonly moreBudgets = computed(() => this.budgets.active().length > TOP_BUDGETS);

  // Trend (DSH-04)

  readonly trend = computed(() =>
    periodSummaries([...this.earlier(), ...this.txs()], this.periods()),
  );
  readonly trendEmpty = computed(() => !this.earlier().length && !this.txs().length);
  /** Each period as a group of income and expense bars, with its net under the label. */
  readonly trendGroups = computed<BarChartGroup[]>(() =>
    this.trend().map((s) => ({
      key: s.range.start,
      label: this.shortLabel(s.range),
      title: formatPeriod(s.range, this.locale()),
      values: { income: s.income, expense: s.expense },
      caption: this.compactMoney(s.net, 'exceptZero'),
    })),
  );
  /** Income and expense bars, in the income and expense colors, with a legend and signs elsewhere (NFR-09). */
  readonly flowSeries: readonly ChartSeries[] = [
    { key: 'income', label: 'Income', color: 'var(--success)' },
    { key: 'expense', label: 'Expense', color: 'var(--error)' },
  ];

  // Recent and largest (DSH-05, DSH-15)

  readonly recent = computed<TxRow[]>(() =>
    this.txs()
      .slice(0, RECENT_COUNT)
      .map((tx) => withDate(this.rows.toRow(tx, this.today()))),
  );
  readonly largest = computed<TxRow[]>(() =>
    largestExpenses(this.txs(), LARGEST_COUNT).map((tx) =>
      withDate(this.rows.toRow(tx, this.today())),
    ),
  );

  // Upcoming (DSH-08)

  readonly hasRules = computed(() => this.rules.views().length > 0);
  /** Occurrences of running rules due by today or in the next seven days, soonest first. */
  readonly upcoming = computed<UpcomingRow[]>(() => {
    const today = this.today();
    return this.rules
      .active()
      .flatMap((view) =>
        upcomingDates(view.rule, today, UPCOMING_DAYS).map((date) => ({
          key: `${view.id}_${date}`,
          view,
          date,
          due: date <= today && date === view.rule.nextDueDate,
        })),
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.view.name.localeCompare(b.view.name));
  });

  // Formatting. Stable functions for the charts; every one honours privacy mode (DSH-09).

  /** Full amounts, for values and tooltips. */
  readonly money = (minor: number): string =>
    this.masked() ? MASKED_AMOUNT : formatMoney(minor, this.currency(), this.locale());
  /** Signed amounts: +Rs 12.00, −Rs 5.00. */
  readonly signedMoney = (minor: number): string =>
    this.masked()
      ? MASKED_AMOUNT
      : formatMoney(minor, this.currency(), this.locale(), 'exceptZero');
  /** Short amounts, for chart axes and captions. */
  readonly compactMoney = (minor: number, signDisplay: 'auto' | 'exceptZero' = 'auto'): string =>
    this.masked()
      ? MASKED_AMOUNT
      : formatCompactMoney(minor, this.currency(), this.locale(), signDisplay);
  readonly compactTick = (minor: number): string => this.compactMoney(minor);

  /** "Sep" for a calendar month, "25 Aug" (its first day) for any other period (BR-05). */
  shortLabel(range: DateRange): string {
    const options: Intl.DateTimeFormatOptions = isCalendarMonth(range)
      ? { month: 'short' }
      : { day: 'numeric', month: 'short' };
    return new Intl.DateTimeFormat(this.locale(), options).format(parseISO(range.start));
  }

  /** "Today", "Tomorrow", or "Thu, 1 Oct 2026"; a date already passed reads "Due Sat, 26 Sep 2026". */
  dueLabel(date: string): string {
    const today = this.today();
    if (date === today) return 'Today';
    if (date === format(addDays(parseISO(today), 1), 'yyyy-MM-dd')) return 'Tomorrow';
    const label = this.rows.dateLabel(date);
    return date < today ? `Due ${label}` : label;
  }

  /** Changes the period in the URL, keeping the rest. `null` removes a parameter. */
  set(changes: Partial<Record<DashboardParam, string | null>>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: changes,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  setPreset(preset: DashboardPreset): void {
    if (preset === 'custom') {
      // Custom starts from whatever the page showed.
      const { start, end } = this.range();
      this.set({ period: preset, from: start, to: end });
    } else {
      this.set({ period: preset, from: null, to: null });
    }
  }

  setCustom(range: DateRange): void {
    const { start, end } = orderedRange(range.start, range.end);
    this.set({ period: 'custom', from: start, to: end });
  }

  /** Selects the period in the switcher, under its preset when it is one (DSH-11). */
  selectPeriod(range: DateRange): void {
    const today = this.today();
    const day = this.startDay();
    if (sameRange(range, monthPeriod(today, day))) this.setPreset('this_month');
    else if (sameRange(range, monthPeriod(today, day, -1))) this.setPreset('last_month');
    else this.setCustom(range);
  }

  /** Opens the transaction list on the entries behind a figure (DSH-11). */
  drillDown(target: DrillDown): void {
    void this.router.navigate(['/transactions'], {
      queryParams: {
        from: target.range.start,
        to: target.range.end,
        type: target.type,
        category: target.categoryIds?.length ? target.categoryIds.join(',') : undefined,
      },
    });
  }

  private spendingRow(total: CategoryTotal): SpendingRow {
    const category = this.categories.byId(total.categoryId);
    const uncategorized = [SYSTEM_CATEGORY_IDS.expense.uncategorized, ''].includes(
      total.categoryId,
    );
    return {
      key: total.categoryId || 'none',
      categoryIds: total.categoryId ? [total.categoryId] : [],
      name: category
        ? this.categories.path(category)
        : uncategorized
          ? 'Uncategorized'
          : 'Deleted category',
      icon: category?.icon ?? 'help',
      color: category?.color ?? null,
      amount: total.amount,
      count: total.count,
      share: shareOf(total.amount, this.spent()),
    };
  }
}

/** Percent used for sorting: a zero limit is over everything, and figures still loading sort last. */
function usedOf(progress: BudgetProgress | undefined): number {
  if (!progress) return -1;
  return progress.percent ?? Number.POSITIVE_INFINITY;
}
