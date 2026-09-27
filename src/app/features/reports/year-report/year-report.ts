import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { spanOf } from '../../../core/domain/period';
import { periodSummaries, summaryOf } from '../../../core/domain/reports';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { BarChart, BarChartGroup } from '../../../shared/components/ui/chart';
import { TransactionActions } from '../../transactions/transaction-actions';
import { PeriodTable } from '../period-table/period-table';
import { ReportsStore } from '../reports.store';
import { SummaryTiles } from '../summary-tiles/summary-tiles';

/**
 * A year by month (RPT-05): the year's totals, grouped bars for each of its
 * twelve month periods (budget months when the month starts on another day
 * than the 1st, BR-05), and a table of every month with the year's total. A
 * month opens its entries (RPT-04).
 */
@Component({
  selector: 'app-year-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BarChart, Button, Card, EmptyState, PeriodTable, SummaryTiles],
  template: `
    @if (!store.txs().length) {
      <l-card>
        <app-empty-state
          icon="calendar_month"
          title="No entries this year"
          message="Pick another year, or add an entry."
        >
          <l-button size="lg" (click)="add()">Add transaction</l-button>
        </app-empty-state>
      </l-card>
    } @else {
      <app-summary-tiles [summary]="total()" [signedMoney]="store.signedMoney" />
      <l-card title="Income and expense by month">
        <l-bar-chart
          [label]="'Income and expense by month, ' + yearLabel()"
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
      <l-card title="Month by month" [flush]="true">
        <app-period-table
          [caption]="'Income, expense and net by month, ' + yearLabel()"
          totalLabel="Year"
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
  `,
})
export class YearReport {
  protected readonly store = inject(ReportsStore);
  private readonly transactions = inject(TransactionActions);

  private readonly span = computed(() => spanOf(this.store.yearMonths())!);
  protected readonly yearLabel = computed(() => this.store.yearLabel());
  private readonly summaries = computed(() =>
    periodSummaries(this.store.txs(), this.store.yearMonths()),
  );
  protected readonly total = computed(() => summaryOf(this.span(), this.store.txs()));
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
