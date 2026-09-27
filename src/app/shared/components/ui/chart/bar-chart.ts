import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { BarChartGroup, ChartFormat, ChartSeries, defaultChartFormat, niceTicks } from './chart';
import { ChartTable, ChartTableRow } from './chart-table';
import { ChartTip, ChartTipRow } from './chart-tip';
import { ChartToggle } from './chart-toggle';

let nextId = 0;

/** A group ready to draw: formatted values and bar heights as % of the top tick. */
interface BarRow {
  group: BarChartGroup;
  name: string;
  aria: string;
  bars: (ChartTipRow & { pct: number })[];
}

/**
 * Grouped column chart: one column per group (x position), one bar per series inside it.
 * HTML/CSS layout, so it fills its container and adapts with container queries.
 *
 * ```html
 * <l-bar-chart
 *   label="Income and expense by month"
 *   [groups]="months()"
 *   [series]="[
 *     { key: 'income', label: 'Income', color: 'var(--success)' },
 *     { key: 'expense', label: 'Expense', color: 'var(--error)' },
 *   ]"
 *   [format]="formatMoney"
 *   [selected]="currentKey()"
 *   [clickable]="true"
 *   (groupClick)="open($event)"
 * />
 * ```
 *
 * A legend appears for two or more series. Hover or focus shows one tooltip listing every
 * series; the "Table" toggle swaps the plot for an equivalent `<table>`, so no value is
 * reachable only by hovering.
 */
@Component({
  selector: 'l-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartTable, ChartTip, ChartToggle, NgTemplateOutlet],
  templateUrl: './bar-chart.html',
  styleUrl: './bar-chart.scss',
  host: { class: 'l-bar-chart' },
})
export class BarChart {
  /** X positions, left to right. */
  readonly groups = input.required<readonly BarChartGroup[]>();
  /** Bars within each group, in this order. */
  readonly series = input.required<readonly ChartSeries[]>();
  /** Formats values in the tooltip, the table and (unless `tickFormat` is set) the y-axis. */
  readonly format = input<ChartFormat>(defaultChartFormat);
  /** Formats y-axis tick labels; falls back to `format`. */
  readonly tickFormat = input<ChartFormat | null>(null);
  /** Accessible name of the chart and caption of the table view. */
  readonly label = input.required<string>();
  /** Plot height in px, excluding the x-axis label band below it. */
  readonly height = input(200);
  /** Key of the highlighted group. */
  readonly selected = input<string | null>(null);
  /** Make each group (and each table row) a button that emits `groupClick`. */
  readonly clickable = input(false);
  /** Show the table view instead of the plot. */
  readonly showTable = model(false);
  /**
   * Offer the "Table" toggle. Turn it off only where the page already shows the same
   * figures in a table of its own.
   */
  readonly tableToggle = input(true);

  readonly groupClick = output<BarChartGroup>();

  protected readonly _tipId = `l-bar-chart-tip-${++nextId}`;
  protected readonly _hover = signal<number | null>(null);
  protected readonly _focus = signal<number | null>(null);

  protected readonly _ticks = computed(() => {
    let max = 0;
    for (const group of this.groups()) {
      for (const s of this.series()) max = Math.max(max, group.values[s.key] ?? 0);
    }
    return niceTicks(max);
  });

  protected readonly _tickFormat = computed(() => this.tickFormat() ?? this.format());

  protected readonly _rows = computed<BarRow[]>(() => {
    const top = this._ticks().at(-1)!;
    const format = this.format();
    const series = this.series();
    return this.groups().map((group) => {
      const name = group.title ?? group.label;
      const bars = series.map((s) => {
        const value = group.values[s.key] ?? 0;
        return {
          key: s.key,
          label: s.label,
          color: s.color,
          value: format(value),
          pct: value > 0 ? (value / top) * 100 : 0,
        };
      });
      const aria = `${name}: ${bars.map((b) => `${b.label} ${b.value}`).join(', ')}`;
      return { group, name, aria, bars };
    });
  });

  protected readonly _columns = computed(() => this.series().map((s) => s.label));

  protected readonly _tableRows = computed<ChartTableRow[]>(() =>
    this._rows().map((row) => ({
      key: row.group.key,
      name: row.name,
      cells: row.bars.map((bar) => bar.value),
      current: row.group.key === this.selected(),
    })),
  );

  /** The group whose tooltip is showing (pointer first, then keyboard focus) and where. */
  protected readonly _tip = computed(() => {
    const index = this._hover() ?? this._focus();
    const rows = this._rows();
    if (index === null || !rows[index]) return null;
    const row = rows[index];
    const n = rows.length;
    // Beside the column band: to its right in the left half, flipped to its left in the right
    // half, and capped to the room left so it never leaves the plot.
    if (n === 1) return { index, row, left: '50%', right: null, maxWidth: '100%', shift: '-50%' };
    const flip = index + 0.5 >= n / 2;
    const edge = ((flip ? n - index : index + 1) / n) * 100;
    const offset = `calc(${edge}% + 4px)`;
    return {
      index,
      row,
      left: flip ? null : offset,
      right: flip ? offset : null,
      maxWidth: `calc(${100 - edge}% - 4px)`,
      shift: null,
    };
  });

  protected _onClick(group: BarChartGroup | undefined): void {
    if (group && this.clickable()) this.groupClick.emit(group);
  }

  protected _onRowClick(key: string): void {
    this._onClick(this.groups().find((group) => group.key === key));
  }

  protected _hideTip(): void {
    this._hover.set(null);
    this._focus.set(null);
  }
}
