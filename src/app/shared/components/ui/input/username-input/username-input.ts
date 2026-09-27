import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormValidation } from '../../../../directives/form-validation';
import { BaseInput, provideInputValueAccessor } from '../input';

/**
 * Username field with a user icon — a text input variant. There is no
 * built-in format validator: validate in the consumer (e.g. `Validators.pattern`)
 * and the shared `FormValidation` directive surfaces the message inline.
 */
@Component({
  selector: 'l-username-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './username-input.html',
  providers: [provideInputValueAccessor(() => UsernameInput)],
  hostDirectives: [{ directive: FormValidation, inputs: ['useValidation'] }],
})
export class UsernameInput extends BaseInput {
  protected readonly type = 'text';
}
