import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { DonutChart, DonutSegment } from '../../../shared/components/ui/chart';
import { ReportRow } from '../../reports/report-row/report-row';
import { entries, percentText } from '../../reports/report-labels';
import { TransactionActions } from '../../transactions/transaction-actions';
import { categoryCount } from '../dashboard-labels';
import { DashboardStore, SpendingRow } from '../dashboard.store';

/**
 * The period's expenses by category (DSH-03): a donut of the top five and
 * "Other", each with its amount and share, in the category's color and icon.
 * Transfers and balance adjustments stay out and subcategories roll up
 * (DSH-12). The chart's table toggle lists the same rows (NFR-09); a slice or
 * a row opens the transaction list on that category and period (DSH-11).
 */
@Component({
  selector: 'app-spending-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Card, DonutChart, EmptyState, ReportRow],
  templateUrl: './spending-card.html',
  styleUrl: './spending-card.scss',
})
export class SpendingCard {
  protected readonly store = inject(DashboardStore);
  private readonly transactions = inject(TransactionActions);

  protected readonly percent = percentText;
  protected readonly entries = entries;
  /** The donut's table view stands in for the rows, so they aren't listed twice. */
  protected readonly showTable = signal(false);

  /** "3 entries", or "4 categories · 9 entries" for Other. */
  protected caption(row: SpendingRow): string {
    const count = entries(row.count);
    return row.categoryIds.length > 1
      ? `${categoryCount(row.categoryIds.length)} · ${count}`
      : count;
  }

  protected open(row: SpendingRow): void {
    if (!row.categoryIds.length) return;
    this.store.drillDown({
      range: this.store.range(),
      type: 'expense',
      categoryIds: row.categoryIds,
    });
  }

  protected openSegment(segment: DonutSegment): void {
    const row = this.store.spending().find((r) => r.key === segment.key);
    if (row) this.open(row);
  }

  protected add(): void {
    this.transactions.create({ type: 'expense' }).subscribe();
  }
}
