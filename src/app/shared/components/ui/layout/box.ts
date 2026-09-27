import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
} from '@angular/core';

/** Preset (`xs` 4px, `sm` 8px, `md` 16px, `lg` 24px, `xl` 32px), a pixel number, or any CSS size. */
export type BoxSpacing = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number | string;
/** A pixel number or any CSS size value (`'50%'`, `'20rem'`, …). */
export type BoxSize = number | string;

const SPACING_PRESETS: Record<string, string> = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
};

function toSpacing(value: BoxSpacing | undefined): string | null {
  if (value === undefined) return null;
  if (typeof value === 'number') return `${value}px`;
  return SPACING_PRESETS[value] ?? value;
}

function toSize(value: BoxSize | undefined): string | null {
  if (value === undefined) return null;
  return typeof value === 'number' ? `${value}px` : value;
}

/**
 * Base building block inspired by Mantine's `Box` — a block element with style
 * props for spacing, size and color, so one-off layout tweaks don't need a
 * stylesheet. Spacing props accept the preset scale (`xs` 4px … `xl` 32px), a
 * pixel number, or any CSS value; explicit sides win over the `mx`/`my`/`px`/`py`
 * pairs, which win over `m`/`p`.
 *
 * Also usable as an attribute on any element — the LumenUI equivalent of
 * Mantine's `component` prop — so the box can render as a link, button, etc.
 *
 * ```html
 * <l-box p="md" bg="var(--accent-bg)" c="var(--accent-dark)">Highlighted</l-box>
 * <a l-box href="/docs" p="sm">Link box</a>
 * ```
 */
@Component({
  selector: 'l-box, [l-box]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: {
    '[style.display]': '_display',
    '[style.margin-top]': '_marginTop()',
    '[style.margin-bottom]': '_marginBottom()',
    '[style.margin-left]': '_marginLeft()',
    '[style.margin-right]': '_marginRight()',
    '[style.padding-top]': '_paddingTop()',
    '[style.padding-bottom]': '_paddingBottom()',
    '[style.padding-left]': '_paddingLeft()',
    '[style.padding-right]': '_paddingRight()',
    '[style.width]': '_width()',
    '[style.min-width]': '_minWidth()',
    '[style.max-width]': '_maxWidth()',
    '[style.height]': '_height()',
    '[style.min-height]': '_minHeight()',
    '[style.max-height]': '_maxHeight()',
    '[style.background]': 'bg() ?? null',
    '[style.color]': 'c() ?? null',
  },
})
export class Box {
  /** Margin on all sides. */
  readonly m = input<BoxSpacing>();
  /** Horizontal margin (left + right). */
  readonly mx = input<BoxSpacing>();
  /** Vertical margin (top + bottom). */
  readonly my = input<BoxSpacing>();
  readonly mt = input<BoxSpacing>();
  readonly mb = input<BoxSpacing>();
  readonly ml = input<BoxSpacing>();
  readonly mr = input<BoxSpacing>();
  /** Padding on all sides. */
  readonly p = input<BoxSpacing>();
  /** Horizontal padding (left + right). */
  readonly px = input<BoxSpacing>();
  /** Vertical padding (top + bottom). */
  readonly py = input<BoxSpacing>();
  readonly pt = input<BoxSpacing>();
  readonly pb = input<BoxSpacing>();
  readonly pl = input<BoxSpacing>();
  readonly pr = input<BoxSpacing>();
  /** Width. */
  readonly w = input<BoxSize>();
  /** Min-width. */
  readonly miw = input<BoxSize>();
  /** Max-width. */
  readonly maw = input<BoxSize>();
  /** Height. */
  readonly h = input<BoxSize>();
  /** Min-height. */
  readonly mih = input<BoxSize>();
  /** Max-height. */
  readonly mah = input<BoxSize>();
  /** Background — any CSS color, including tokens like `var(--accent-bg)`. */
  readonly bg = input<string>();
  /** Text color — any CSS color, including tokens like `var(--accent-dark)`. */
  readonly c = input<string>();

  /** `<l-box>` itself renders as a block (like a div); attribute usage keeps the host's own display. */
  protected readonly _display =
    inject(ElementRef).nativeElement.tagName === 'L-BOX' ? 'block' : null;

  protected readonly _marginTop = computed(() => toSpacing(this.mt() ?? this.my() ?? this.m()));
  protected readonly _marginBottom = computed(() => toSpacing(this.mb() ?? this.my() ?? this.m()));
  protected readonly _marginLeft = computed(() => toSpacing(this.ml() ?? this.mx() ?? this.m()));
  protected readonly _marginRight = computed(() => toSpacing(this.mr() ?? this.mx() ?? this.m()));
  protected readonly _paddingTop = computed(() => toSpacing(this.pt() ?? this.py() ?? this.p()));
  protected readonly _paddingBottom = computed(() => toSpacing(this.pb() ?? this.py() ?? this.p()));
  protected readonly _paddingLeft = computed(() => toSpacing(this.pl() ?? this.px() ?? this.p()));
  protected readonly _paddingRight = computed(() => toSpacing(this.pr() ?? this.px() ?? this.p()));
  protected readonly _width = computed(() => toSize(this.w()));
  protected readonly _minWidth = computed(() => toSize(this.miw()));
  protected readonly _maxWidth = computed(() => toSize(this.maw()));
  protected readonly _height = computed(() => toSize(this.h()));
  protected readonly _minHeight = computed(() => toSize(this.mih()));
  protected readonly _maxHeight = computed(() => toSize(this.mah()));
}
