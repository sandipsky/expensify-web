import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Change } from '../../../core/domain/reports';
import { TxType } from '../../../core/models/transaction';
import { Icon, IconName } from '../../../shared/components/ui/icon/icon';
import { changeText, percentText } from '../../reports/report-labels';
import { pointsText } from '../dashboard-labels';
import { DashboardStore } from '../dashboard.store';

/** How a figure moved: an up or down arrow beside the text, never color (NFR-09). */
interface ChangeView {
  icon: IconName | null;
  text: string;
}

interface Tile {
  key: string;
  label: string;
  /** Income and expense carry an icon in their color besides the sign (NFR-09). */
  icon: IconName | null;
  iconColor: string;
  value: string;
  change: ChangeView | null;
  /** The list filter the tile opens (DSH-11). */
  type?: TxType;
}

/**
 * Income, expense, net and savings rate for the period (DSH-01), each with
 * its change from the previous period as an amount and a percent (DSH-10).
 * Every tile opens the transaction list on the period: income and expense
 * filtered to their type (DSH-11). The change is left out when the previous
 * period has no entries.
 */
@Component({
  selector: 'app-summary-cards',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  templateUrl: './summary-cards.html',
  styleUrl: './summary-cards.scss',
})
export class SummaryCards {
  protected readonly store = inject(DashboardStore);

  protected readonly tiles = computed<Tile[]>(() => {
    const summary = this.store.summary();
    const change = this.store.change();
    return [
      {
        key: 'income',
        label: 'Income',
        icon: 'south_west',
        iconColor: 'var(--success)',
        value: this.store.signedMoney(summary.income),
        change: change && this.amountChange(change.income),
        type: 'income',
      },
      {
        key: 'expense',
        label: 'Expense',
        icon: 'north_east',
        iconColor: 'var(--error)',
        value: this.store.signedMoney(-summary.expense),
        change: change && this.amountChange(change.expense),
        type: 'expense',
      },
      {
        key: 'net',
        label: 'Net',
        icon: null,
        iconColor: '',
        value: this.store.signedMoney(summary.net),
        change: change && this.amountChange(change.net),
      },
      {
        key: 'savings',
        label: 'Savings rate',
        icon: null,
        iconColor: '',
        value: percentText(summary.savingsRate),
        change:
          change &&
          (change.savingsRate === null
            ? null
            : this.arrow(change.savingsRate, pointsText(change.savingsRate, this.store.locale()))),
      },
    ];
  });

  protected open(type?: TxType): void {
    this.store.drillDown({ range: this.store.range(), type });
  }

  /** "+Rs 500.00 (+25%)", or the amount alone when there was nothing before. */
  private amountChange(change: Change): ChangeView {
    const amount = this.store.signedMoney(change.amount);
    const text =
      change.percent === null
        ? amount
        : `${amount} (${changeText(change.percent, this.store.locale())})`;
    return this.arrow(change.amount, text);
  }

  private arrow(delta: number, text: string): ChangeView {
    return { icon: delta > 0 ? 'arrow_upward' : delta < 0 ? 'arrow_downward' : null, text };
  }
}
