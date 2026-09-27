import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, map, of, switchMap } from 'rxjs';
import { BudgetChanges, BudgetsRepo } from '../../core/data/budgets.repo';
import { TransactionsRepo } from '../../core/data/transactions.repo';
import {
  BudgetHistoryEntry,
  BudgetProgress,
  DEFAULT_ALERT_THRESHOLDS,
  PeriodSettings,
  budgetHistory,
  budgetProgress,
  compareBudgets,
  countsToward,
  neededRange,
} from '../../core/domain/budget';
import { DateRange, coversRange, inRange, sameRange, spanOf } from '../../core/domain/period';
import { compareNewestFirst } from '../../core/domain/transactions';
import { Budget, BudgetInput } from '../../core/models/budget';
import { Category } from '../../core/models/category';
import { Transaction } from '../../core/models/transaction';
import { Preferences } from '../../core/preferences';
import { Today } from '../../core/today';
import { CategoriesStore } from '../categories/categories.store';

/** Transactions loaded for a range, so figures are only drawn from data that covers them. */
export interface Spending {
  range: DateRange;
  txs: Transaction[];
}

/** For budgets over every expense or several categories. */
const BUDGET_ICON = { icon: 'donut_large', color: 'var(--accent)' };

/**
 * Budgets for the whole app: the Budgets pages, the alerts (BUD-06) and later
 * the dashboard's card share the budgets listener and one listener on the
 * dates their current figures need (NFR-19). Root-provided for that reason.
 */
@Injectable({ providedIn: 'root' })
export class BudgetsStore {
  private readonly repo = inject(BudgetsRepo);
  private readonly transactions = inject(TransactionsRepo);
  private readonly categories = inject(CategoriesStore);
  private readonly prefs = inject(Preferences);

  /** Budgets are in the base currency until multi-currency (§8). */
  readonly currency = this.prefs.baseCurrency;

  /** The local date; moves on at midnight and when the app comes back into view. */
  readonly today = inject(Today).date;

  readonly settings = computed<PeriodSettings>(() => ({
    monthStartDay: this.prefs.monthStartDay(),
    weekStartDay: this.prefs.weekStartDay(),
  }));

  private readonly _all = toSignal(this.repo.watchAll());

  /** True until the first snapshot arrives; skeletons show only then. */
  readonly loading = computed(() => this._all() === undefined);
  /** For every expense first, then by name. */
  readonly all = computed(() => [...(this._all() ?? [])].sort(compareBudgets));
  readonly active = computed(() => this.all().filter((b) => b.active));
  readonly paused = computed(() => this.all().filter((b) => !b.active));

  /** One range over what every active budget's current figures read. */
  private readonly span = computed(
    () => spanOf(this.active().map((b) => neededRange(b, this.today(), this.settings()))),
    { equal: sameRange },
  );

  private readonly spending = toSignal(
    toObservable(this.span).pipe(
      switchMap((range) => (range ? this.watchSpending(range) : of(null))),
    ),
  );

  private readonly categoriesById = computed(
    () => new Map(this.categories.all().map((c) => [c.id, c])),
  );

  /**
   * Each active budget's current figures by ID (BUD-02, BUD-03). A budget is
   * missing while the transactions it needs, or the categories that roll
   * subcategories up (BR-07), are still loading.
   */
  readonly progress = computed(() => {
    const result = new Map<string, BudgetProgress>();
    const spending = this.spending();
    if (!spending || this.categories.loading()) return result;
    for (const budget of this.active()) {
      const progress = this.progressFrom(budget, spending);
      if (progress) result.set(budget.id, progress);
    }
    return result;
  });

  byId(id: string): Budget | undefined {
    return this.all().find((b) => b.id === id);
  }

  progressOf(budget: Budget): BudgetProgress | undefined {
    return this.progress().get(budget.id);
  }

  /** What the budget counts: "All expenses", or its categories as "Food and dining, Transport". */
  scopeOf(budget: Budget): string {
    if (!budget.categoryIds.length) return 'All expenses';
    const names = budget.categoryIds
      .map((id) => this.categories.byId(id))
      .filter((c): c is Category => !!c)
      .map((c) => this.categories.path(c));
    return names.length ? names.join(', ') : 'Deleted categories';
  }

  /** A single-category budget wears its category's icon; others a generic one. */
  iconOf(budget: Budget): { icon: string; color: string } {
    const only =
      budget.categoryIds.length === 1 ? this.categories.byId(budget.categoryIds[0]) : null;
    return only ? { icon: only.icon, color: only.color } : BUDGET_ICON;
  }

  /** The transactions in a range, live, tagged with it. */
  watchSpending(range: DateRange): Observable<Spending> {
    return this.transactions.watchRange(range).pipe(map((txs) => ({ range, txs })));
  }

  /** The dates a budget's page reads: its history (BUD-05) through the current period. */
  historyRange(budget: Budget, periods: number): DateRange {
    return neededRange(budget, this.today(), this.settings(), periods);
  }

  /** The current figures from `spending`, or undefined when it doesn't cover them. */
  progressFrom(budget: Budget, spending: Spending): BudgetProgress | undefined {
    if (!coversRange(spending.range, neededRange(budget, this.today(), this.settings()))) return;
    return budgetProgress(
      budget,
      spending.txs,
      this.today(),
      this.settings(),
      this.categoriesById(),
    );
  }

  /** The `periods` before the current one, newest first (BUD-05); empty when `spending` doesn't cover them. */
  historyFrom(budget: Budget, spending: Spending, periods: number): BudgetHistoryEntry[] {
    if (!coversRange(spending.range, this.historyRange(budget, periods))) return [];
    return budgetHistory(
      budget,
      spending.txs,
      this.today(),
      this.settings(),
      this.categoriesById(),
      periods,
    );
  }

  /** The entries a budget counted in the range, newest first (§13 budget detail). */
  transactionsIn(budget: Budget, spending: Spending, range: DateRange): Transaction[] {
    const byId = this.categoriesById();
    return spending.txs
      .filter((tx) => inRange(tx.date, range) && countsToward(budget, tx, byId))
      .sort(compareNewestFirst);
  }

  /** Adds a budget and returns its ID (BUD-01). Alerts start at 80% and 100% (BUD-06). */
  create(input: BudgetInput): string {
    return this.repo.create({
      name: input.name.trim(),
      amount: input.amount,
      period: input.period,
      categoryIds: [...input.categoryIds],
      rollover: input.rollover,
      alertThresholds: input.alerts ? [...DEFAULT_ALERT_THRESHOLDS] : [],
      active: true,
    });
  }

  /**
   * Saves the fields that changed. Keeping alerts on keeps the thresholds the
   * budget already has, which another app may have set.
   */
  update(budget: Budget, input: BudgetInput): void {
    const thresholds = input.alerts
      ? budget.alertThresholds.length
        ? budget.alertThresholds
        : [...DEFAULT_ALERT_THRESHOLDS]
      : [];
    const next: BudgetChanges = {
      name: input.name.trim(),
      amount: input.amount,
      period: input.period,
      categoryIds: [...input.categoryIds],
      rollover: input.rollover,
      alertThresholds: thresholds,
    };
    const changes: BudgetChanges = {};
    for (const [key, value] of Object.entries(next) as [keyof BudgetChanges, unknown][]) {
      const old = budget[key];
      const same =
        Array.isArray(old) && Array.isArray(value)
          ? old.join('\n') === value.join('\n')
          : old === value;
      if (!same) (changes as Record<string, unknown>)[key] = value;
    }
    if (Object.keys(changes).length) this.repo.update(budget.id, changes);
  }

  /** Paused budgets keep their settings but show no progress and send no alerts. */
  setActive(budget: Budget, active: boolean): void {
    if (budget.active !== active) this.repo.update(budget.id, { active });
  }

  delete(budget: Budget): void {
    this.repo.delete(budget.id);
  }

  /** Undoes a delete. */
  restore(budget: Budget): void {
    this.repo.restore(budget);
  }

  /** Records that the period's alert at `threshold` was shown (BUD-06). */
  recordAlert(budget: Budget, periodStart: string, threshold: number): void {
    this.repo.recordAlert(budget.id, { periodStart, threshold });
  }
}
