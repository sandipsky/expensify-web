import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormValidation } from '../../../../directives/form-validation';
import { BaseInput, provideInputValueAccessor } from '../input';

/**
 * Single-line text field. `suggestions` offers earlier values as the user types,
 * through the browser's own `<datalist>` list, which works with the keyboard,
 * touch and screen readers alike.
 *
 * ```html
 * <l-text-input label="Payee" formControlName="payee" [suggestions]="payees()" />
 * ```
 */
@Component({
  selector: 'l-text-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './text-input.html',
  providers: [provideInputValueAccessor(() => TextInput)],
  hostDirectives: [{ directive: FormValidation, inputs: ['useValidation'] }],
})
export class TextInput extends BaseInput {
  protected readonly type = 'text';

  /** Values to suggest while typing; the field still accepts anything. */
  readonly suggestions = input<readonly string[]>([]);
}
