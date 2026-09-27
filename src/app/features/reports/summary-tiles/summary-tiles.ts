import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PeriodSummary } from '../../../core/domain/reports';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { percentText } from '../report-labels';

/**
 * Income, expense, net and savings rate for a span of time, as four tiles.
 * Income and expense carry a sign and an icon besides their color (NFR-09);
 * a savings rate without income reads "—" (BR-04).
 */
@Component({
  selector: 'app-summary-tiles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="tile">
      <span class="tile__label">
        <l-icon name="south_west" [size]="16" color="var(--success)" />Income
      </span>
      <span class="tile__value">{{ signedMoney()(summary().income) }}</span>
    </div>
    <div class="tile">
      <span class="tile__label">
        <l-icon name="north_east" [size]="16" color="var(--error)" />Expense
      </span>
      <span class="tile__value">{{ signedMoney()(-summary().expense) }}</span>
    </div>
    <div class="tile">
      <span class="tile__label">Net</span>
      <span class="tile__value">{{ signedMoney()(summary().net) }}</span>
    </div>
    <div class="tile">
      <span class="tile__label">Savings rate</span>
      <span class="tile__value">{{ percent(summary().savingsRate) }}</span>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
    }

    .tile {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px 16px;
      border: 1px solid var(--separator);
      border-radius: 12px;
      background: var(--bg-lightest);
    }

    .tile__label {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--text-tertiary);
      font-size: 12px;
      line-height: 16px;
    }

    .tile__value {
      color: var(--text-primary);
      font-size: 18px;
      font-weight: 600;
      line-height: 24px;
      overflow-wrap: anywhere;
    }
  `,
})
export class SummaryTiles {
  readonly summary = input.required<PeriodSummary>();
  readonly signedMoney = input.required<(minor: number) => string>();

  protected readonly percent = percentText;
}
