import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormValidation } from '../../../../directives/form-validation';
import { Icon } from '../../icon/icon';
import { BaseRadioInput, RadioOption, provideInputValueAccessor } from '../input';

/** An icon tile. `icon` and `color` let each option draw its own icon, as category tiles do. */
export interface IconOption extends RadioOption {
  /** Icon name from `public/svg/`; defaults to `value`. */
  icon?: string;
  /** This tile's color, any CSS color; defaults to the picker's `color`. */
  color?: string;
}

/**
 * Pick one icon from a grid. Each option's `value` is an icon name from
 * `public/svg/` (or set `icon` per option) and its `label` the accessible
 * name. It's a radio group underneath, so the arrow keys move through the
 * grid. The chosen tile shows in `color`, to preview the icon as it will be
 * drawn. With `showLabels`, every tile shows its label under the icon, drawn
 * in the option's own `color`: a grid of named choices, such as categories.
 * The grid grows with its options, so a long list belongs in a scrolling
 * container.
 *
 * ```html
 * <l-icon-picker
 *   label="Icon"
 *   formControlName="icon"
 *   color="#EA580C"
 *   [options]="[{ label: 'Restaurant', value: 'restaurant' }, { label: 'Home', value: 'home' }]"
 * />
 * <l-icon-picker
 *   label="Category"
 *   formControlName="categoryId"
 *   [showLabels]="true"
 *   [options]="[{ label: 'Food', value: 'exp_food', icon: 'restaurant', color: '#EA580C' }]"
 * />
 * ```
 */
@Component({
  selector: 'l-icon-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  templateUrl: './icon-picker.html',
  styleUrl: './icon-picker.scss',
  providers: [provideInputValueAccessor(() => IconPicker)],
  hostDirectives: [{ directive: FormValidation, inputs: ['useValidation'] }],
  host: { '[style.--pick-color]': 'color()' },
})
export class IconPicker extends BaseRadioInput {
  /** Color of the chosen icon and its tile; any CSS color, including `var(--…)` tokens. */
  readonly color = input('var(--accent)');

  /** Show each option's label under its icon. */
  readonly showLabels = input(false);

  protected _iconName(option: IconOption): string {
    return option.icon ?? String(option.value);
  }

  protected _tileColor(option: IconOption): string | null {
    return option.color ?? null;
  }
}
