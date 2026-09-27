import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DateRange } from '../../../core/domain/period';
import { PeriodSummary } from '../../../core/domain/reports';
import { percentText } from '../report-labels';

/** One row of the table: a period's summary and how it's named. */
export interface PeriodRow {
  key: string;
  /** "September 2026", or the date range when months start on another day (BR-05). */
  label: string;
  /** "Sep 2026", for narrow screens. */
  shortLabel: string;
  summary: PeriodSummary;
  /** The period containing today. */
  current?: boolean;
}

/**
 * Income, expense, net and savings rate per period, with a total row (RPT-02,
 * RPT-05). It's also the table alternative to the bar chart above it (NFR-09).
 * Each period's name opens its entries (RPT-04).
 */
@Component({
  selector: 'app-period-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './period-table.html',
  styleUrl: './period-table.scss',
})
export class PeriodTable {
  readonly caption = input.required<string>();
  readonly rows = input.required<readonly PeriodRow[]>();
  /** The sum of every row, named `totalLabel`. */
  readonly total = input<PeriodSummary | null>(null);
  readonly totalLabel = input('Total');
  readonly money = input.required<(minor: number) => string>();
  readonly signedMoney = input.required<(minor: number) => string>();

  readonly open = output<DateRange>();

  protected readonly percent = percentText;
}
