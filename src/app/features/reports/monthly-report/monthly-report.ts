import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { switchMap } from 'rxjs';
import { TransactionsRepo } from '../../../core/data/transactions.repo';
import { budgetResult, createdDate } from '../../../core/domain/budget';
import { exportOrder } from '../../../core/domain/csv-export';
import { formatMoney } from '../../../core/domain/money';
import {
  DateRange,
  formatPeriod,
  inRange,
  monthPeriod,
  sameRange,
} from '../../../core/domain/period';
import {
  CategoryTotal,
  accountFlows,
  categoryTotals,
  changePercent,
  shareOf,
  summaryOf,
} from '../../../core/domain/reports';
import { CategoryType } from '../../../core/models/category';
import { Preferences } from '../../../core/preferences';
import { Today } from '../../../core/today';
import { Breadcrumb } from '../../../shared/components/ui/breadcrumb';
import { Button } from '../../../shared/components/ui/button/button';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { Toggle } from '../../../shared/components/ui/input/toggle/toggle';
import { Skeleton } from '../../../shared/components/ui/skeleton';
import { AccountsStore } from '../../accounts/accounts.store';
import { BUDGET_STATES, percentLabel } from '../../budgets/budget-labels';
import { BudgetsStore } from '../../budgets/budgets.store';
import { CategoriesStore } from '../../categories/categories.store';
import { TransactionRows } from '../../transactions/transaction-rows';
import { SummaryTiles } from '../summary-tiles/summary-tiles';
import { changeText, percentText } from '../report-labels';

/** How far back and ahead the report pages, in month periods. */
const MIN_OFFSET = -240;
const MAX_OFFSET = 12;

interface CategoryLine {
  id: string;
  name: string;
  amount: number;
  share: string;
  /** For the bar, 0–100. */
  pct: number;
  color: string;
  count: number;
}

/**
 * `/reports/monthly?offset=-1`: one month period on a printable page (DAT-05),
 * saved as PDF from the browser's print dialog, which needs no library and
 * keeps every script and currency sign the fonts have. Totals with the change
 * from the month before, both category breakdowns, monthly budgets, money in
 * and out per account, and every entry. The month follows the month start day
 * (BR-05); transfers and balance adjustments stay out of the totals (TXN-09, BR-12).
 */
@Component({
  selector: 'app-monthly-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Breadcrumb, Button, Icon, Skeleton, SummaryTiles, Toggle],
  templateUrl: './monthly-report.html',
  styleUrl: './monthly-report.scss',
})
export class MonthlyReport {
  /** Query parameter: month periods from the current one, 0 = this month. */
  readonly offset = input<string>();

  private readonly repo = inject(TransactionsRepo);
  private readonly prefs = inject(Preferences);
  private readonly today = inject(Today).date;
  private readonly accounts = inject(AccountsStore);
  private readonly categories = inject(CategoriesStore);
  private readonly budgets = inject(BudgetsStore);
  private readonly rows = inject(TransactionRows);
  private readonly router = inject(Router);

  protected readonly currency = this.prefs.baseCurrency;
  private readonly locale = this.prefs.locale;

  protected readonly monthOffset = computed(() => {
    const value = Math.trunc(Number(this.offset() ?? 0)) || 0;
    return Math.min(MAX_OFFSET, Math.max(MIN_OFFSET, value));
  });
  protected readonly range = computed(
    () => monthPeriod(this.today(), this.prefs.monthStartDay(), this.monthOffset()),
    { equal: sameRange },
  );
  private readonly previous = computed(
    () => monthPeriod(this.today(), this.prefs.monthStartDay(), this.monthOffset() - 1),
    { equal: sameRange },
  );
  protected readonly label = computed(() => formatPeriod(this.range(), this.locale()));
  protected readonly madeOn = computed(() =>
    new Intl.DateTimeFormat(this.locale(), { dateStyle: 'long' }).format(new Date()),
  );

  /** Every entry list prints on; off gives a one- or two-page summary. */
  protected readonly withEntries = signal(true);

  /** One listener over this period and the one before, for changes and rollover (NFR-19). */
  private readonly span = computed<DateRange>(
    () => ({ start: this.previous().start, end: this.range().end }),
    { equal: sameRange },
  );
  private readonly txs = toSignal(
    toObservable(this.span).pipe(switchMap((span) => this.repo.watchRange(span))),
  );
  protected readonly loading = computed(() => this.txs() === undefined);
  private readonly current = computed(() =>
    (this.txs() ?? []).filter((tx) => inRange(tx.date, this.range())),
  );

  protected readonly summary = computed(() => summaryOf(this.range(), this.current()));
  protected readonly changes = computed(() => {
    const before = summaryOf(
      this.previous(),
      (this.txs() ?? []).filter((tx) => inRange(tx.date, this.previous())),
    );
    const now = this.summary();
    return {
      income: changeText(changePercent(before.income, now.income), this.locale()),
      expense: changeText(changePercent(before.expense, now.expense), this.locale()),
      net: changeText(changePercent(before.net, now.net), this.locale()),
      previous: formatPeriod(this.previous(), this.locale()),
    };
  });

  protected readonly breakdowns = computed(() => [
    { title: 'Spending by category', lines: this.categoryLines('expense') },
    { title: 'Income by category', lines: this.categoryLines('income') },
  ]);

  protected readonly flows = computed(() =>
    accountFlows(this.current()).map((flow) => ({
      ...flow,
      name: this.accounts.byId(flow.accountId)?.name ?? 'Deleted account',
    })),
  );

  /** Monthly budgets that were running in this month, with what they came to (BUD-02). */
  protected readonly budgetLines = computed(() => {
    const byId = new Map(this.categories.all().map((c) => [c.id, c]));
    const end = this.range().end;
    return this.budgets
      .active()
      .filter((b) => b.period === 'monthly' && (createdDate(b) ?? '') <= end)
      .map((budget) => {
        const result = budgetResult(
          budget,
          this.txs() ?? [],
          this.today(),
          this.budgets.settings(),
          byId,
          this.monthOffset(),
        );
        return { id: budget.id, name: budget.name, ...result, view: BUDGET_STATES[result.state] };
      });
  });

  protected readonly entries = computed(() =>
    exportOrder(this.current()).map((tx) => this.rows.toRow(tx, this.today())),
  );

  protected readonly money = (minor: number) => formatMoney(minor, this.currency(), this.locale());
  protected readonly signedMoney = (minor: number) =>
    formatMoney(minor, this.currency(), this.locale(), 'exceptZero');
  protected readonly percent = percentText;
  protected readonly percentUsed = percentLabel;

  protected step(by: number): void {
    void this.router.navigate([], {
      queryParams: { offset: this.monthOffset() + by || null },
      replaceUrl: true,
    });
  }

  protected print(): void {
    window.print();
  }

  private categoryLines(type: CategoryType): CategoryLine[] {
    const byId = new Map(this.categories.all().map((c) => [c.id, c]));
    const totals = categoryTotals(this.current(), type, byId);
    const sum = totals.reduce((s, t) => s + t.amount, 0);
    const largest = totals[0]?.amount ?? 0;
    return totals.map((total: CategoryTotal) => {
      const category = this.categories.byId(total.categoryId);
      return {
        id: total.categoryId || 'none',
        name: category?.name ?? (total.categoryId ? 'Deleted category' : 'Uncategorized'),
        amount: total.amount,
        share: percentText(shareOf(total.amount, sum)),
        pct: largest ? (total.amount * 100) / largest : 0,
        color: category?.color ?? 'var(--text-quaternary)',
        count: total.count,
      };
    });
  }
}
