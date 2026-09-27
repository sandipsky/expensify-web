import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Preset (`xs` 4px, `sm` 8px, `md` 16px, `lg` 24px, `xl` 32px), a pixel number, or any CSS size. */
export type SpacerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number | string;

const SIZE_PRESETS: Record<string, string> = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
};

function toCssSize(size: SpacerSize | undefined): string | null {
  if (size === undefined) return null;
  if (typeof size === 'number') return `${size}px`;
  return SIZE_PRESETS[size] ?? size;
}

/**
 * Empty block that adds fixed space between elements — inspired by Mantine's
 * `Space`. Use `h` for vertical gaps in a stack and `w` for horizontal gaps in
 * a row; it never shrinks, so the space holds inside flex layouts.
 *
 * ```html
 * <p>First</p>
 * <l-spacer h="md" />
 * <p>Second</p>
 *
 * <l-flex align="center">
 *   <l-button>Save</l-button>
 *   <l-spacer [w]="24" />
 *   <l-button>Cancel</l-button>
 * </l-flex>
 * ```
 */
@Component({
  selector: 'l-spacer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  host: {
    'aria-hidden': 'true',
    '[style.display]': "'block'",
    '[style.height]': '_height()',
    '[style.width]': '_width()',
    '[style.flex-shrink]': '0',
  },
})
export class Spacer {
  /** Vertical space — sets the height. */
  readonly h = input<SpacerSize>();
  /** Horizontal space — sets the width. */
  readonly w = input<SpacerSize>();

  protected readonly _height = computed(() => toCssSize(this.h()));
  protected readonly _width = computed(() => toCssSize(this.w()));
}
