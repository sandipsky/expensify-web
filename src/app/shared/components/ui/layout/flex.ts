import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type FlexJustify =
  'normal' | 'start' | 'end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
export type FlexAlign = 'normal' | 'start' | 'end' | 'center' | 'stretch' | 'baseline';
export type FlexWrap = boolean | 'nowrap' | 'wrap' | 'wrap-reverse';
/** Preset (`small` 8px, `middle` 16px, `large` 24px), a pixel number, or any CSS gap value. */
export type FlexGap = 'small' | 'middle' | 'large' | number | string;

const GAP_PRESETS: Record<string, string> = { small: '8px', middle: '16px', large: '24px' };

/**
 * Flexbox container inspired by Ant Design's `Flex`. A thin, style-only wrapper —
 * all layout is applied to the host element, so children flow exactly as written.
 *
 * ```html
 * <l-flex gap="middle" justify="space-between" align="center">…</l-flex>
 * <l-flex [vertical]="true" gap="small">…</l-flex>
 * ```
 */
@Component({
  selector: 'l-flex',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: {
    '[style.display]': "'flex'",
    '[style.flex-direction]': "vertical() ? 'column' : 'row'",
    '[style.flex-wrap]': '_wrapStyle()',
    '[style.justify-content]': '_justifyStyle()',
    '[style.align-items]': '_alignStyle()',
    '[style.gap]': '_gapStyle()',
  },
})
export class Flex {
  /** Lay children out as a column instead of a row. */
  readonly vertical = input(false);
  readonly justify = input<FlexJustify>('normal');
  readonly align = input<FlexAlign>('normal');
  /** `true`/`false`, or any CSS `flex-wrap` keyword. */
  readonly wrap = input<FlexWrap>(false);
  readonly gap = input<FlexGap>(0);

  protected readonly _wrapStyle = computed(() => {
    const wrap = this.wrap();
    return typeof wrap === 'boolean' ? (wrap ? 'wrap' : 'nowrap') : wrap;
  });

  protected readonly _justifyStyle = computed(() => toCssAlignment(this.justify()));
  protected readonly _alignStyle = computed(() => toCssAlignment(this.align()));

  protected readonly _gapStyle = computed(() => {
    const gap = this.gap();
    if (typeof gap === 'number') return gap ? `${gap}px` : null;
    return GAP_PRESETS[gap] ?? gap;
  });
}

/** `start`/`end` need the `flex-` prefix for widest browser support; `normal` means "unset". */
function toCssAlignment(value: string): string | null {
  if (value === 'normal') return null;
  return value === 'start' || value === 'end' ? `flex-${value}` : value;
}
