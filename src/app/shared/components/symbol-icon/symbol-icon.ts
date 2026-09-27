import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon } from '../ui/icon/icon';

/**
 * An account's or category's Material Symbols icon in its color, on a light
 * tint of that color. Both store the pair as `icon` and `color` (§8).
 *
 * ```html
 * <app-symbol-icon [icon]="category.icon" [color]="category.color" [size]="32" />
 * ```
 */
@Component({
  selector: 'app-symbol-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: '<l-icon [name]="icon()" [size]="_glyph()" color="var(--symbol-color)" />',
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: color-mix(in srgb, var(--symbol-color) 12%, transparent);
    }
  `,
  host: {
    '[style.--symbol-color]': 'color()',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
  },
})
export class SymbolIcon {
  readonly icon = input.required<string>();
  /** Hex color from the document. */
  readonly color = input.required<string>();
  /** Diameter in px. */
  readonly size = input(40);

  protected readonly _glyph = computed(() => Math.round(this.size() * 0.55));
}
