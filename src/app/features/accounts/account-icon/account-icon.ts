import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon } from '../../../shared/components/ui/icon/icon';

/** An account's Material Symbols icon in its color, on a light tint of that color. */
@Component({
  selector: 'app-account-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: '<l-icon [name]="icon()" [size]="_glyph()" color="var(--account-color)" />',
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: color-mix(in srgb, var(--account-color) 12%, transparent);
    }
  `,
  host: {
    '[style.--account-color]': 'color()',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
  },
})
export class AccountIcon {
  readonly icon = input.required<string>();
  /** Hex color from the account document. */
  readonly color = input.required<string>();
  /** Diameter in px. */
  readonly size = input(40);

  protected readonly _glyph = computed(() => Math.round(this.size() * 0.55));
}
