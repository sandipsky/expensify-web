import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { spanOf } from '../../../core/domain/period';
import { periodSummaries, summaryOf } from '../../../core/domain/reports';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { BarChart, BarChartGroup } from '../../../shared/components/ui/chart';
import { TransactionActions } from '../../transactions/transaction-actions';
import { PeriodTable } from '../period-table/period-table';
import { ReportsStore, TREND_MONTHS } from '../reports.store';
import { SummaryTiles } from '../summary-tiles/summary-tiles';

/**
 * Income, expense and net over the last twelve month periods, the current one
 * included (RPT-02): totals and monthly averages, grouped bars with each
 * period's net, and the same figures as a table (NFR-09). A period opens its
 * entries (RPT-04).
 */
@Component({
  selector: 'app-trend-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BarChart, Button, Card, EmptyState, PeriodTable, SummaryTiles],
  template: `
    @if (empty()) {
      <l-card>
        <app-empty-state
          icon="bar_chart"
          title="No entries in the last 12 months"
          message="Log a few entries to see your trend."
        >
          <l-button size="lg" (click)="add()">Add transaction</l-button>
        </app-empty-state>
      </l-card>
    } @else {
      <app-summary-tiles [summary]="total()" [signedMoney]="store.signedMoney" />
      <p class="report-note">
        Average per month: income {{ store.money(average().income) }}, expense
        {{ store.money(average().expense) }}.
      </p>
      <l-card title="Income and expense">
        <l-bar-chart
          label="Income and expense, last 12 months"
          [groups]="groups()"
          [series]="store.flowSeries"
          [format]="store.money"
          [tickFormat]="store.compactMoney"
          [selected]="currentKey()"
          [clickable]="true"
          [tableToggle]="false"
          (groupClick)="open($event)"
        />
      </l-card>
      <l-card title="By month" [flush]="true">
        <app-period-table
          caption="Income, expense and net, last 12 months"
          totalLabel="12 months"
          [rows]="rows()"
          [total]="total()"
          [money]="store.money"
          [signedMoney]="store.signedMoney"
          (open)="store.drillDown({ range: $event })"
        />
      </l-card>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .report-note {
      margin-top: -8px;
      color: var(--text-tertiary);
      font-size: 13px;
    }
  `,
})
export class TrendReport {
  protected readonly store = inject(ReportsStore);
  private readonly transactions = inject(TransactionActions);

  private readonly summaries = computed(() =>
    periodSummaries(this.store.txs(), this.store.trendMonths()),
  );
  protected readonly empty = computed(() => !this.store.txs().length);
  protected readonly total = computed(() =>
    summaryOf(spanOf(this.store.trendMonths())!, this.store.txs()),
  );
  /** Rounded down, like any figure split across days or months. */
  protected readonly average = computed(() => ({
    income: Math.floor(this.total().income / TREND_MONTHS),
    expense: Math.floor(this.total().expense / TREND_MONTHS),
  }));
  protected readonly groups = computed(() => this.store.toGroups(this.summaries()));
  protected readonly rows = computed(() => this.store.toRows(this.summaries()));
  protected readonly currentKey = computed(() => this.rows().find((r) => r.current)?.key ?? null);

  protected open(group: BarChartGroup): void {
    const row = this.rows().find((r) => r.key === group.key);
    if (row) this.store.drillDown({ range: row.summary.range });
  }

  protected add(): void {
    this.transactions.create().subscribe();
  }
}
