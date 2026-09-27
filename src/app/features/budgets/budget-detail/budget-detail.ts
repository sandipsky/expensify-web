import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { of, switchMap } from 'rxjs';
import { BudgetResult, HISTORY_PERIODS } from '../../../core/domain/budget';
import { DateRange, coversRange, formatPeriod, sameRange } from '../../../core/domain/period';
import { Budget } from '../../../core/models/budget';
import { Preferences } from '../../../core/preferences';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { SymbolIcon } from '../../../shared/components/symbol-icon/symbol-icon';
import { Breadcrumb } from '../../../shared/components/ui/breadcrumb';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { Chip } from '../../../shared/components/ui/chip';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { Menu } from '../../../shared/components/ui/menu';
import { Progress } from '../../../shared/components/ui/progress';
import { Skeleton } from '../../../shared/components/ui/skeleton';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { CategoriesStore } from '../../categories/categories.store';
import { TransactionActions } from '../../transactions/transaction-actions';
import { TransactionRow } from '../../transactions/transaction-row/transaction-row';
import { TransactionRows, TxRow } from '../../transactions/transaction-rows';
import { BudgetActions } from '../budget-actions';
import {
  BUDGET_PERIOD_LABELS,
  BUDGET_STATES,
  PER_PERIOD,
  StateView,
  percentLabel,
} from '../budget-labels';
import { BudgetMeter } from '../budget-meter/budget-meter';
import { BudgetsStore } from '../budgets.store';

/** How many of a period's transactions show before "Show more". */
const PAGE_SIZE = 50;

/** One period in the results list: the current one first, then the past ones (BUD-05). */
export interface PeriodRow {
  /** 0 for the current period, −1 for the one before, … */
  offset: number;
  label: string;
  result: BudgetResult;
  percent: string;
  state: StateView;
  /** The period ended before the budget was created: shown for comparison only. */
  beforeBudget: boolean;
}

/**
 * `/budgets/:id`: the budget's current period, its results for past periods
 * (BUD-05) and the transactions behind whichever period is selected (§13). One
 * listener covers all the periods shown (NFR-19).
 */
@Component({
  selector: 'app-budget-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Breadcrumb,
    BudgetMeter,
    Button,
    Card,
    Chip,
    EmptyState,
    Icon,
    Menu,
    MoneyPipe,
    Progress,
    Skeleton,
    SymbolIcon,
    TransactionRow,
  ],
  templateUrl: './budget-detail.html',
  styleUrl: './budget-detail.scss',
})
export class BudgetDetail {
  /** The `:id` route parameter. */
  readonly id = input.required<string>();

  protected readonly store = inject(BudgetsStore);
  protected readonly actions = inject(BudgetActions);
  private readonly transactions = inject(TransactionActions);
  private readonly txRows = inject(TransactionRows);
  private readonly categories = inject(CategoriesStore);
  private readonly router = inject(Router);
  private readonly locale = inject(Preferences).locale;

  protected readonly budget = computed(() => this.store.byId(this.id()));
  protected readonly icon = computed(() => {
    const budget = this.budget();
    return budget ? this.store.iconOf(budget) : null;
  });
  protected readonly caption = computed(() => {
    const budget = this.budget();
    if (!budget) return '';
    const limit = `${BUDGET_PERIOD_LABELS[budget.period]} limit`;
    return `${limit} · ${this.store.scopeOf(budget)}`;
  });
  protected readonly perPeriod = computed(() => {
    const budget = this.budget();
    return budget ? PER_PERIOD[budget.period] : '';
  });

  private readonly periods = computed(() => {
    const budget = this.budget();
    return budget ? HISTORY_PERIODS[budget.period] : 0;
  });

  /** From the oldest period shown through the current one. */
  private readonly range = computed<DateRange | null>(
    () => {
      const budget = this.budget();
      return budget ? this.store.historyRange(budget, this.periods()) : null;
    },
    { equal: sameRange },
  );

  private readonly spending = toSignal(
    toObservable(this.range).pipe(
      switchMap((range) => (range ? this.store.watchSpending(range) : of(null))),
    ),
  );

  /** True until the listener covers every period shown and categories have loaded. */
  protected readonly loadingSpending = computed(() => {
    const spending = this.spending();
    const range = this.range();
    return !spending || !range || !coversRange(spending.range, range) || this.categories.loading();
  });

  protected readonly current = computed(() => {
    const budget = this.budget();
    const spending = this.spending();
    if (!budget || !spending || this.loadingSpending()) return undefined;
    return this.store.progressFrom(budget, spending);
  });

  /** The current period, then the past ones, newest first (BUD-05). */
  protected readonly periodRows = computed<PeriodRow[]>(() => {
    const budget = this.budget();
    const spending = this.spending();
    const current = this.current();
    if (!budget || !spending || !current) return [];
    const past = this.store.historyFrom(budget, spending, this.periods());
    return [
      this.toPeriodRow(0, current, false),
      ...past.map((entry, i) => this.toPeriodRow(-(i + 1), entry, entry.beforeBudget)),
    ];
  });

  /** The period whose transactions show; back to the current one when the budget changes. */
  protected readonly selected = linkedSignal({ source: this.id, computation: () => 0 });
  protected readonly selectedRow = computed(
    () => this.periodRows().find((row) => row.offset === this.selected()) ?? this.periodRows()[0],
  );

  private readonly allRows = computed(() => {
    const budget = this.budget();
    const spending = this.spending();
    const row = this.selectedRow();
    if (!budget || !spending || !row) return [];
    const today = this.store.today();
    return this.store
      .transactionsIn(budget, spending, row.result.range)
      .map((tx) => this.txRows.toRow(tx, today));
  });

  /** How many rows show; one page again whenever another period is picked. */
  private readonly limit = linkedSignal({ source: this.selectedRow, computation: () => PAGE_SIZE });
  protected readonly rows = computed(() => this.allRows().slice(0, this.limit()));
  protected readonly hiddenCount = computed(() => this.allRows().length - this.rows().length);

  protected select(row: PeriodRow): void {
    this.selected.set(row.offset);
  }

  protected showMore(): void {
    this.limit.update((limit) => limit + PAGE_SIZE);
  }

  /** An expense form, in the budget's category when it has just one. */
  protected addExpense(budget: Budget): void {
    const categoryId = budget.categoryIds.length === 1 ? budget.categoryIds[0] : undefined;
    this.transactions.create({ type: 'expense', categoryId }).subscribe();
  }

  protected openTransaction(row: TxRow): void {
    this.transactions.edit(row.tx).subscribe();
  }

  protected delete(budget: Budget): void {
    this.actions.delete(budget);
    this.router.navigateByUrl('/budgets');
  }

  protected backToBudgets(): void {
    this.router.navigateByUrl('/budgets');
  }

  private toPeriodRow(offset: number, result: BudgetResult, beforeBudget: boolean): PeriodRow {
    return {
      offset,
      label: formatPeriod(result.range, this.locale()),
      result,
      percent: percentLabel(result.percent),
      state: BUDGET_STATES[result.state],
      beforeBudget,
    };
  }
}
