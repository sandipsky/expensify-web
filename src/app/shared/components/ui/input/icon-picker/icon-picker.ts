import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormValidation } from '../../../../directives/form-validation';
import { Icon } from '../../icon/icon';
import { BaseRadioInput, provideInputValueAccessor } from '../input';

/**
 * Pick one icon from a grid. Each option's `value` is an icon name from
 * `public/svg/` and its `label` the accessible name. It's a radio group
 * underneath, so the arrow keys move through the grid. The chosen tile shows
 * in `color`, to preview the icon as it will be drawn. The grid grows with
 * its options, so a long list belongs in a scrolling container.
 *
 * ```html
 * <l-icon-picker
 *   label="Icon"
 *   formControlName="icon"
 *   color="#EA580C"
 *   [options]="[{ label: 'Restaurant', value: 'restaurant' }, { label: 'Home', value: 'home' }]"
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

  protected _iconName(value: unknown): string {
    return String(value);
  }
}
