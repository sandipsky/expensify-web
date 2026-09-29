import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { BarChart, BarChartGroup } from '../../../shared/components/ui/chart';
import { TransactionActions } from '../../transactions/transaction-actions';
import { DashboardStore, TREND_PERIODS } from '../dashboard.store';

/**
 * Income and expense for the selected period and the five before it, with
 * each period's net under its bars (DSH-04); the chart's table toggle shows
 * the same figures (NFR-09). A bar selects that period in the switcher
 * (DSH-11).
 */
@Component({
  selector: 'app-trend-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BarChart, Button, Card, EmptyState],
  template: `
    <l-card title="Income vs expense" [flush]="store.trendEmpty()">
      @if (store.trendEmpty()) {
        <app-empty-state
          icon="bar_chart"
          title="No trend yet"
          message="Log a few entries to see your trend."
        >
          <l-button size="lg" (click)="add()">Add transaction</l-button>
        </app-empty-state>
      } @else {
        <l-bar-chart
          [label]="'Income and expense, last ' + periods + ' periods'"
          [groups]="store.trendGroups()"
          [series]="store.flowSeries"
          [format]="store.money"
          [tickFormat]="store.compactTick"
          [selected]="store.range().start"
          [clickable]="true"
          [height]="180"
          (groupClick)="select($event)"
        />
      }
    </l-card>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }

    l-card {
      height: 100%;
    }
  `,
})
export class TrendCard {
  protected readonly store = inject(DashboardStore);
  private readonly transactions = inject(TransactionActions);

  protected readonly periods = TREND_PERIODS;

  protected select(group: BarChartGroup): void {
    const summary = this.store.trend().find((s) => s.range.start === group.key);
    if (summary) this.store.selectPeriod(summary.range);
  }

  protected add(): void {
    this.transactions.create().subscribe();
  }
}
