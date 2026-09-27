import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

export type GridBreakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

/** Per-breakpoint column settings; a bare number is shorthand for `{ span }`. */
export interface ColSize {
  span?: number;
  offset?: number;
  order?: number;
}
export type ColResponsive = number | ColSize;

export type RowJustify =
  'start' | 'end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
export type RowAlign = 'top' | 'middle' | 'bottom' | 'stretch';

const COLUMNS = 12;

/** Bootstrap's responsive breakpoints (min-widths, px). */
const BREAKPOINT_MIN_WIDTH: Record<GridBreakpoint, number> = {
  xs: 0,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
  xxl: 1400,
};
const BREAKPOINT_ORDER: GridBreakpoint[] = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'];

const ROW_ALIGN_MAP: Record<RowAlign, string> = {
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end',
  stretch: 'stretch',
};

/**
 * Tracks the viewport width as a signal so `l-col` responsive props re-evaluate
 * on resize. Root-scoped — the listener lives for the app's lifetime.
 */
@Injectable({ providedIn: 'root' })
export class GridBreakpoints {
  private readonly _width = signal(window.innerWidth);

  /** Active breakpoints, smallest first — later entries override earlier ones (mobile-first). */
  readonly active = computed(() =>
    BREAKPOINT_ORDER.filter((bp) => this._width() >= BREAKPOINT_MIN_WIDTH[bp]),
  );

  constructor() {
    window.addEventListener('resize', () => this._width.set(window.innerWidth));
  }
}

/**
 * 12-column grid row, Bootstrap-style. Hosts `l-col` children and hands them
 * the horizontal `gutter` (cols pad themselves; the row cancels the outer
 * padding with negative margins). A `[h, v]` gutter adds vertical space
 * between wrapped lines via `row-gap`.
 *
 * ```html
 * <l-row [gutter]="[16, 16]" justify="center" align="middle">
 *   <l-col [span]="6" [md]="4">…</l-col>
 * </l-row>
 * ```
 */
@Component({
  selector: 'l-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: {
    '[style.display]': "'flex'",
    '[style.flex-wrap]': "wrap() ? 'wrap' : 'nowrap'",
    '[style.justify-content]': '_justifyStyle()',
    '[style.align-items]': '_alignStyle()',
    '[style.margin-left.px]': '_gutterMargin()',
    '[style.margin-right.px]': '_gutterMargin()',
    '[style.row-gap.px]': 'gutterY() || null',
  },
})
export class Row {
  /** Spacing between columns (px). A `[horizontal, vertical]` pair also spaces wrapped lines. */
  readonly gutter = input<number | [number, number]>(0);
  readonly justify = input<RowJustify>('start');
  readonly align = input<RowAlign>('top');
  readonly wrap = input(true);

  /** Horizontal gutter — read by child `l-col`s to pad themselves. */
  readonly gutterX = computed(() => {
    const gutter = this.gutter();
    return Array.isArray(gutter) ? gutter[0] : gutter;
  });

  readonly gutterY = computed(() => {
    const gutter = this.gutter();
    return Array.isArray(gutter) ? gutter[1] : 0;
  });

  protected readonly _justifyStyle = computed(() => {
    const justify = this.justify();
    return justify === 'start' || justify === 'end' ? `flex-${justify}` : justify;
  });

  protected readonly _alignStyle = computed(() => ROW_ALIGN_MAP[this.align()]);

  protected readonly _gutterMargin = computed(() => (this.gutterX() ? -this.gutterX() / 2 : null));
}

/**
 * Grid column for `l-row`, on a 12-column track. `span`/`offset`/`order` are the
 * base values; the `xs`…`xxl` inputs override them per breakpoint, mobile-first
 * (the largest matching breakpoint wins). `span: 0` hides the column. `flex`
 * takes precedence over `span` for fill/fixed-width columns.
 */
@Component({
  selector: 'l-col',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: {
    '[style.display]': "_hidden() ? 'none' : 'block'",
    '[style.box-sizing]': "'border-box'",
    '[style.min-width]': "'0'",
    '[style.flex]': '_flexStyle()',
    '[style.max-width]': '_maxWidthStyle()',
    '[style.margin-left]': '_offsetStyle()',
    '[style.order]': '_orderStyle()',
    '[style.padding-left.px]': '_gutterPad()',
    '[style.padding-right.px]': '_gutterPad()',
  },
})
export class Col {
  /** Columns to span out of 12. `0` hides the column. Unset → sized by content (or `flex`). */
  readonly span = input<number | null>(null);
  /** Columns to skip on the left, out of 12. */
  readonly offset = input(0);
  readonly order = input<number | null>(null);
  /** CSS `flex` shorthand — `'auto'` (fill), a grow number, or e.g. `'0 0 200px'`. */
  readonly flex = input<string | number | null>(null);

  readonly xs = input<ColResponsive | null>(null);
  readonly sm = input<ColResponsive | null>(null);
  readonly md = input<ColResponsive | null>(null);
  readonly lg = input<ColResponsive | null>(null);
  readonly xl = input<ColResponsive | null>(null);
  readonly xxl = input<ColResponsive | null>(null);

  private readonly _row = inject(Row, { optional: true });
  private readonly _breakpoints = inject(GridBreakpoints);

  private readonly _byBreakpoint = {
    xs: this.xs,
    sm: this.sm,
    md: this.md,
    lg: this.lg,
    xl: this.xl,
    xxl: this.xxl,
  };

  /** Base size merged with every active breakpoint override, smallest first. */
  private readonly _size = computed<ColSize>(() => {
    const merged: ColSize = {
      span: this.span() ?? undefined,
      offset: this.offset(),
      order: this.order() ?? undefined,
    };
    for (const bp of this._breakpoints.active()) {
      const value = this._byBreakpoint[bp]();
      if (value == null) continue;
      if (typeof value === 'number') merged.span = value;
      else Object.assign(merged, value);
    }
    return merged;
  });

  protected readonly _hidden = computed(() => this._size().span === 0);

  protected readonly _flexStyle = computed(() => {
    const flex = this.flex();
    if (flex !== null && flex !== '') {
      if (typeof flex === 'number') return `${flex} ${flex} auto`;
      if (flex === 'auto') return '1 1 auto';
      if (flex === 'none') return 'none';
      // A bare length ('200px', '25%') means a fixed basis; anything else is passed through.
      return /^\d+(\.\d+)?(px|%|em|rem|vw|vh)$/.test(flex) ? `0 0 ${flex}` : flex;
    }
    const span = this._size().span;
    return span != null ? `0 0 ${percent(span)}` : null;
  });

  protected readonly _maxWidthStyle = computed(() => {
    if (this.flex() !== null) return null;
    const span = this._size().span;
    return span != null ? percent(span) : null;
  });

  protected readonly _offsetStyle = computed(() => {
    const offset = this._size().offset;
    return offset ? percent(offset) : null;
  });

  protected readonly _orderStyle = computed(() => this._size().order ?? null);

  protected readonly _gutterPad = computed(() => {
    const gutterX = this._row?.gutterX() ?? 0;
    return gutterX ? gutterX / 2 : null;
  });
}

function percent(span: number): string {
  return `${(span / COLUMNS) * 100}%`;
}
