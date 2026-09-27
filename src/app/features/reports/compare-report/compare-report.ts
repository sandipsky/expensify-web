import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { formatPeriod } from '../../../core/domain/period';
import { CategoryChange, categoryChanges, changePercent } from '../../../core/domain/reports';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { CategoriesStore } from '../../categories/categories.store';
import { TransactionActions } from '../../transactions/transaction-actions';
import { changeText } from '../report-labels';
import { ReportsStore } from '../reports.store';

interface CompareRow extends CategoryChange {
  name: string;
  /** Bar widths as % of the largest amount in either period. */
  previousPct: number;
  currentPct: number;
}

/**
 * Two periods side by side by category (RPT-03): each category's amount in
 * both, the change in amount and in %, with an arrow and a sign so it doesn't
 * rest on color (NFR-09). A category opens its entries in the later period
 * (RPT-04).
 */
@Component({
  selector: 'app-compare-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Card, EmptyState, Icon],
  templateUrl: './compare-report.html',
  styleUrl: './compare-report.scss',
})
export class CompareReport {
  protected readonly store = inject(ReportsStore);
  private readonly categories = inject(CategoriesStore);
  private readonly transactions = inject(TransactionActions);

  protected change(percent: number | null): string {
    return changeText(percent, this.store.locale());
  }

  protected readonly labelA = computed(() =>
    formatPeriod(this.store.compareA().range, this.store.locale()),
  );
  protected readonly labelB = computed(() =>
    formatPeriod(this.store.compareB().range, this.store.locale()),
  );
  protected readonly typeLabel = computed(() =>
    this.store.type() === 'income' ? 'Income' : 'Expense',
  );

  protected readonly caption = computed(
    () => `${this.typeLabel()} by category, ${this.labelA()} compared with ${this.labelB()}`,
  );

  private readonly byId = computed(() => new Map(this.categories.all().map((c) => [c.id, c])));
  protected readonly rows = computed<CompareRow[]>(() => {
    const [a, b] = this.store.compareTxs();
    const changes = categoryChanges(a, b, this.store.type(), this.byId());
    const max = Math.max(1, ...changes.flatMap((c) => [c.previous, c.current]));
    return changes.map((c) => ({
      ...c,
      name: this.store.categoryView(c.categoryId).name,
      previousPct: (c.previous / max) * 100,
      currentPct: (c.current / max) * 100,
    }));
  });

  protected readonly total = computed(() => {
    const previous = this.rows().reduce((sum, r) => sum + r.previous, 0);
    const current = this.rows().reduce((sum, r) => sum + r.current, 0);
    return {
      previous,
      current,
      change: current - previous,
      percent: changePercent(previous, current),
    };
  });

  protected icon(change: number): string {
    return change > 0 ? 'arrow_upward' : 'arrow_downward';
  }

  protected open(row: CompareRow): void {
    this.store.drillDown({
      range: this.store.compareB().range,
      type: this.store.type(),
      categoryIds: row.categoryId ? [row.categoryId] : undefined,
    });
  }

  protected add(): void {
    this.transactions.create({ type: this.store.type() }).subscribe();
  }
}
