import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormValidation } from '../../../../directives/form-validation';
import { Icon } from '../../icon/icon';
import { BaseRadioInput, provideInputValueAccessor } from '../input';

/**
 * Pick one color from a row of swatches. It's a radio group underneath, so the
 * arrow keys move between colors, and each swatch takes its option's `label`
 * as its accessible name. The form value is the chosen option's `value`, such
 * as a hex string, which also paints the swatch.
 *
 * ```html
 * <l-color-picker
 *   label="Color"
 *   formControlName="color"
 *   [options]="[{ label: 'Red', value: '#DC2626' }, { label: 'Blue', value: '#2456E6' }]"
 * />
 * ```
 */
@Component({
  selector: 'l-color-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  templateUrl: './color-picker.html',
  styleUrl: './color-picker.scss',
  providers: [provideInputValueAccessor(() => ColorPicker)],
  hostDirectives: [{ directive: FormValidation, inputs: ['useValidation'] }],
})
export class ColorPicker extends BaseRadioInput {}
