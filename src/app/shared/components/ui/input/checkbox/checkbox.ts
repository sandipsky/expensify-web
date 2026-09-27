import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormValidation } from '../../../../directives/form-validation';
import { BaseBooleanInput, provideInputValueAccessor } from '../input';

@Component({
  selector: 'l-checkbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './checkbox.html',
  styleUrl: './checkbox.scss',
  providers: [provideInputValueAccessor(() => Checkbox)],
  hostDirectives: [{ directive: FormValidation, inputs: ['useValidation'] }],
})
export class Checkbox extends BaseBooleanInput {
  /** Accessible name when there is no visible `label`, e.g. "Select Groceries". */
  readonly ariaLabel = input<string>();
}
