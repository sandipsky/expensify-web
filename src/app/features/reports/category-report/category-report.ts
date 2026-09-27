import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { categoryTotals, shareOf, topAndOther } from '../../../core/domain/reports';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { DonutChart, DonutSegment } from '../../../shared/components/ui/chart';
import { CategoriesStore } from '../../categories/categories.store';
import { TransactionActions } from '../../transactions/transaction-actions';
import { ReportBar, ReportRow } from '../report-row/report-row';
import { entries, percentText } from '../report-labels';
import { ReportsStore } from '../reports.store';

/** Slices before the rest folds into "Other" (§3.7 card 4). */
const TOP_SLICES = 5;
const OTHER = 'other';
/** Neutral for "Other" and entries without a category, so no category's color is borrowed. */
const NEUTRAL = 'var(--text-quaternary)';

interface CategoryRow {
  categoryId: string;
  name: string;
  icon: string;
  color: string | null;
  amount: number;
  count: number;
  share: number | null;
  bars: ReportBar[];
}

/**
 * Expenses or income by category for the period, with amount and share of the
 * total (RPT-01): a donut of the top five and "Other", beside the full ranked
 * list that doubles as its table view (NFR-09). Subcategories roll up into
 * their parent (CAT-07). A slice or row opens its entries (RPT-04).
 */
@Component({
  selector: 'app-category-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Card, DonutChart, EmptyState, ReportRow],
  templateUrl: './category-report.html',
  styleUrl: './category-report.scss',
})
export class CategoryReport {
  protected readonly store = inject(ReportsStore);
  private readonly categories = inject(CategoriesStore);
  private readonly transactions = inject(TransactionActions);

  protected readonly percent = percentText;
  protected readonly entries = entries;
  protected readonly typeLabel = computed(() =>
    this.store.type() === 'income' ? 'Income' : 'Expenses',
  );

  private readonly byId = computed(() => new Map(this.categories.all().map((c) => [c.id, c])));
  private readonly totals = computed(() =>
    categoryTotals(this.store.txs(), this.store.type(), this.byId()),
  );
  protected readonly total = computed(() => this.totals().reduce((sum, t) => sum + t.amount, 0));
  protected readonly count = computed(() => this.totals().reduce((sum, t) => sum + t.count, 0));

  protected readonly rows = computed<CategoryRow[]>(() => {
    const max = this.totals()[0]?.amount ?? 0;
    return this.totals().map((t) => {
      const view = this.store.categoryView(t.categoryId);
      return {
        ...t,
        ...view,
        share: shareOf(t.amount, this.total()),
        bars: [{ pct: max ? (t.amount / max) * 100 : 0, color: view.color ?? NEUTRAL }],
      };
    });
  });

  /** "Other" only when it would hold two or more categories; one would just be itself. */
  private readonly split = computed(() => {
    const totals = this.totals();
    return topAndOther(totals, totals.length <= TOP_SLICES + 1 ? totals.length : TOP_SLICES);
  });
  protected readonly segments = computed<DonutSegment[]>(() => {
    const { top, other } = this.split();
    const slices = top.map((t) => {
      const view = this.store.categoryView(t.categoryId);
      return { key: t.categoryId, label: view.name, value: t.amount, color: view.color ?? NEUTRAL };
    });
    return other
      ? [...slices, { key: OTHER, label: 'Other', value: other.amount, color: NEUTRAL }]
      : slices;
  });

  protected openCategory(categoryId: string): void {
    this.store.drillDown({
      range: this.store.range(),
      type: this.store.type(),
      categoryIds: categoryId ? [categoryId] : undefined,
    });
  }

  /** "Other" opens every category it holds. */
  protected openSegment(segment: DonutSegment): void {
    if (segment.key !== OTHER) {
      this.openCategory(segment.key);
      return;
    }
    const ids = this.split().other?.categoryIds.filter(Boolean) ?? [];
    this.store.drillDown({ range: this.store.range(), type: this.store.type(), categoryIds: ids });
  }

  protected add(): void {
    this.transactions.create({ type: this.store.type() }).subscribe();
  }
}
