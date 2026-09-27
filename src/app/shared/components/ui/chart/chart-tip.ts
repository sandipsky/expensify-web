import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** @internal One line of a chart tooltip. */
export interface ChartTipRow {
  key: string;
  color: string;
  /** Formatted value: the strong, leading part of the line. */
  value: string;
  label: string;
}

/**
 * @internal Chart tooltip body: an optional heading, then per series a line key in the series
 * color, the value (strong) and the series label (secondary), then an optional note.
 * The chart positions the host and gives it the id its focused mark points at.
 */
@Component({
  selector: 'l-chart-tip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'tooltip' },
  template: `
    @if (heading()) {
      <div class="l-chart__tip-title">{{ heading() }}</div>
    }
    @for (row of rows(); track row.key) {
      <div class="l-chart__tip-row">
        <span class="l-chart__tip-key" [style.background]="row.color"></span>
        <strong>{{ row.value }}</strong>
        <span>{{ row.label }}</span>
      </div>
    }
    @if (note()) {
      <div class="l-chart__tip-note">{{ note() }}</div>
    }
  `,
  styles: `
    :host {
      position: absolute;
      z-index: 1;
      width: max-content;
      padding: 8px 10px;
      border: 1px solid var(--separator);
      border-radius: 8px;
      background: var(--bg-lightest);
      box-shadow: 0 4px 12px rgba(13, 13, 18, 0.1);
      color: var(--text-primary);
      font-size: 12px;
      line-height: 16px;
      pointer-events: none;
    }
    .l-chart__tip-title {
      margin-bottom: 4px;
      color: var(--text-secondary);
    }
    .l-chart__tip-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    strong {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .l-chart__tip-row span:last-child,
    .l-chart__tip-note {
      color: var(--text-secondary);
    }
    .l-chart__tip-key {
      flex-shrink: 0;
      width: 12px;
      height: 2px;
      border-radius: 1px;
    }
    .l-chart__tip-note {
      padding-left: 18px;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class ChartTip {
  readonly heading = input('');
  readonly rows = input.required<readonly ChartTipRow[]>();
  readonly note = input('');
}
