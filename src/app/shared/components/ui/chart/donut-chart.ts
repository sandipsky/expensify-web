import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { ChartFormat, DonutSegment, defaultChartFormat } from './chart';
import { ChartTable, ChartTableRow } from './chart-table';
import { ChartTip, ChartTipRow } from './chart-tip';
import { ChartToggle } from './chart-toggle';

let nextId = 0;

/** Half the surface gap between neighboring segments, in px at `size`. */
const HALF_GAP = 1;

/** A segment ready to draw: its path, formatted value and whole-percent share. */
interface DonutArc {
  segment: DonutSegment;
  path: string;
  share: number;
  text: string;
  aria: string;
  /**
   * Tooltip placement, as % of `size`: anchored on the inner edge at the segment's middle angle
   * and shifted by the matching outer-edge fraction of its own size, so it opens toward the
   * hole (not over the segment) and never leaves the ring's box.
   */
  tip: { left: number; top: number; shift: string };
}

const round = (n: number): number => Math.round(n * 100) / 100;

/** Share of `total` as a whole percent; 0 for non-positive values. */
const shareOf = (value: number, total: number): number =>
  value > 0 && total > 0 ? Math.round((value * 100) / total) : 0;

/**
 * Path of a ring segment from angle `a0` to `a1` (radians, clockwise from 3 o'clock) with
 * edges pulled in by HALF_GAP px, parallel to the radius, so neighbors are split by an even
 * 2px gap. Slivers too thin for the gap collapse to nothing at that radius.
 */
function sectorPath(c: number, outer: number, inner: number, a0: number, a1: number): string {
  const mid = (a0 + a1) / 2;
  const pull = (radius: number) => (radius > HALF_GAP ? Math.asin(HALF_GAP / radius) : Math.PI);
  const edges = (radius: number): [number, number] => {
    const p = pull(radius);
    return a1 - a0 > 2 * p ? [a0 + p, a1 - p] : [mid, mid];
  };
  const point = (radius: number, a: number) =>
    `${round(c + radius * Math.cos(a))} ${round(c + radius * Math.sin(a))}`;
  const [o0, o1] = edges(outer);
  const [i0, i1] = edges(inner);
  const large = (from: number, to: number) => (to - from > Math.PI ? 1 : 0);
  return (
    `M${point(outer, o0)}A${outer} ${outer} 0 ${large(o0, o1)} 1 ${point(outer, o1)}` +
    `L${point(inner, i1)}A${inner} ${inner} 0 ${large(i0, i1)} 0 ${point(inner, i0)}Z`
  );
}

/** Path of a full ring: two circles, drawn with `fill-rule: evenodd` so the hole stays open. */
function ringPath(c: number, outer: number, inner: number): string {
  const circle = (r: number, sweep: number) =>
    `M${round(c - r)} ${c}A${r} ${r} 0 1 ${sweep} ${round(c + r)} ${c}` +
    `A${r} ${r} 0 1 ${sweep} ${round(c - r)} ${c}Z`;
  return circle(outer, 1) + (inner > 0 ? circle(inner, 0) : '');
}

/**
 * Donut chart for part-to-whole: an SVG ring of segments in the order given, with an optional
 * legend and a centered slot for projected content (usually the total).
 *
 * ```html
 * <l-donut-chart label="Expenses by category" [segments]="segments()" [format]="formatMoney">
 *   <strong>{{ total() | money }}</strong>
 * </l-donut-chart>
 * ```
 *
 * Zero and negative values are left out of the ring and the legend (the table still lists
 * them). Hover or focus lifts a segment and shows its value and share; the "Table" toggle
 * swaps the chart for an equivalent `<table>`.
 */
@Component({
  selector: 'l-donut-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartTable, ChartTip, ChartToggle],
  templateUrl: './donut-chart.html',
  styleUrl: './donut-chart.scss',
  host: { class: 'l-donut-chart', '[style.--l-donut-size.px]': 'size()' },
})
export class DonutChart {
  /** Segments in drawing order, clockwise from 12 o'clock (largest first, "Other" last). */
  readonly segments = input.required<readonly DonutSegment[]>();
  /** Formats values in the legend, tooltip and table. */
  readonly format = input<ChartFormat>(defaultChartFormat);
  /** Accessible name of the chart and caption of the table view. */
  readonly label = input.required<string>();
  /** Outer diameter in px; the ring also shrinks to fit a narrower container. */
  readonly size = input(200);
  /** Ring width in px at `size`. */
  readonly thickness = input(28);
  /** Key of the highlighted segment; the others dim. */
  readonly selected = input<string | null>(null);
  /** Make segments (and table rows) focusable buttons that emit `segmentClick`. */
  readonly clickable = input(false);
  /** Render the legend list (swatch, label, value, share). */
  readonly legend = input(true);
  /** Show the table view instead of the chart. */
  readonly showTable = model(false);
  /** Render the "Table" toggle. */
  readonly tableToggle = input(true);

  readonly segmentClick = output<DonutSegment>();

  /** Sum of the positive segment values: the whole the shares are taken of. */
  readonly total = computed(() =>
    this.segments().reduce((sum, s) => (s.value > 0 ? sum + s.value : sum), 0),
  );

  protected readonly _tipId = `l-donut-chart-tip-${++nextId}`;
  protected readonly _hover = signal<string | null>(null);
  protected readonly _focus = signal<string | null>(null);

  protected readonly _arcs = computed<DonutArc[]>(() => {
    const total = this.total();
    const size = this.size();
    const c = size / 2;
    const inner = Math.max(0, c - this.thickness());
    const holeRatio = c > 0 ? inner / c : 0;
    const format = this.format();
    const positive = this.segments().filter((s) => s.value > 0);
    let angle = -Math.PI / 2;
    return positive.map((segment) => {
      const a0 = angle;
      angle += (segment.value / total) * 2 * Math.PI;
      const mid = (a0 + angle) / 2;
      const share = shareOf(segment.value, total);
      const text = format(segment.value);
      return {
        segment,
        path: positive.length === 1 ? ringPath(c, c, inner) : sectorPath(c, c, inner, a0, angle),
        share,
        text,
        aria: `${segment.label}: ${text}, ${share}%`,
        tip: {
          left: round(50 + 50 * holeRatio * Math.cos(mid)),
          top: round(50 + 50 * holeRatio * Math.sin(mid)),
          shift: `${-round(50 + 50 * Math.cos(mid))}% ${-round(50 + 50 * Math.sin(mid))}%`,
        },
      };
    });
  });

  /** Every segment, for the table view. */
  protected readonly _tableRows = computed<ChartTableRow[]>(() => {
    const total = this.total();
    const format = this.format();
    return this.segments().map((segment) => ({
      key: segment.key,
      name: segment.label,
      cells: [format(segment.value), `${shareOf(segment.value, total)}%`],
      current: segment.key === this.selected(),
    }));
  });

  /** The lifted segment: pointer first, then keyboard focus, then `selected`. */
  protected readonly _emphasis = computed(() => {
    const key = this._hover() ?? this._focus() ?? this.selected();
    return this._arcs().some((a) => a.segment.key === key) ? key : null;
  });

  protected readonly _tip = computed(() => {
    const key = this._hover() ?? this._focus();
    const arc = this._arcs().find((a) => a.segment.key === key);
    if (!arc) return null;
    const { segment, text } = arc;
    const rows: ChartTipRow[] = [
      { key: segment.key, color: segment.color, value: text, label: segment.label },
    ];
    return { arc, rows, note: `${arc.share}%` };
  });

  /** Diameter of the hole as % of the ring, to size the centered slot. */
  protected readonly _holePct = computed(
    () => (Math.max(0, this.size() - 2 * this.thickness()) / this.size()) * 100,
  );

  protected _onRowClick(key: string): void {
    const segment = this.segments().find((s) => s.key === key);
    if (segment) this._activate(segment);
  }

  protected _activate(segment: DonutSegment, event?: Event): void {
    if (!this.clickable()) return;
    event?.preventDefault();
    this.segmentClick.emit(segment);
  }

  protected _hideTip(): void {
    this._hover.set(null);
    this._focus.set(null);
  }
}
