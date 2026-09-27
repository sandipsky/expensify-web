/**
 * One series of a bar chart, or how a donut segment is colored. `color` is any CSS color,
 * usually a token such as `var(--success)`.
 */
export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

/** One x-axis position of a grouped bar chart: a label and each series' value by series key. */
export interface BarChartGroup {
  key: string;
  /** Short axis label, e.g. "Sep". */
  label: string;
  /** Longer name for tooltips and the table, e.g. "September 2026"; falls back to `label`. */
  title?: string;
  values: Readonly<Record<string, number>>;
  /**
   * Optional second line under the axis label, e.g. the period's net "+Rs 12k"; hidden when
   * the chart is narrow (container query, < 480px).
   */
  caption?: string;
}

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Formats a value for tooltips, the table and (by default) axis ticks. */
export type ChartFormat = (value: number) => string;

/** @internal Default `format` of both charts. */
export const defaultChartFormat: ChartFormat = (value) => value.toLocaleString();

/** Step multipliers per power of ten, smallest first. */
const NICE_STEPS = [1, 2, 2.5, 5, 10];

/**
 * "Nice" y-axis ticks from 0 to at least `max`: about `count` evenly spaced ticks whose step is
 * 1, 2, 2.5 or 5 × 10^n, so the top tick is the first round number at or above `max`.
 * A `max` of 0 or less (or not finite) gives `[0, 1]`, so an all-zero chart still has a scale.
 *
 * ```ts
 * niceTicks(3000); // [0, 1000, 2000, 3000]
 * niceTicks(1250); // [0, 500, 1000, 1500]
 * ```
 */
export function niceTicks(max: number, count = 5): number[] {
  if (!(max > 0) || !Number.isFinite(max)) return [0, 1];
  const intervals = Math.max(1, Math.round(count) - 1);
  const raw = max / intervals;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  // The epsilon keeps float noise (2.5000000001) from skipping a step.
  const nice = NICE_STEPS.find((step) => step >= normalized - 1e-9) ?? 10;
  const step = nice * magnitude;
  const last = Math.ceil(max / step - 1e-9);
  const ticks: number[] = [];
  for (let i = 0; i <= last; i++) ticks.push(Number((i * step).toPrecision(12)));
  return ticks;
}
