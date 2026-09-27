import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { AbstractControl, ValidationErrors, Validator } from '@angular/forms';
import { FormValidation } from '../../../../directives/form-validation';
import { BaseInput, provideInputValidator, provideInputValueAccessor } from '../input';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'l-email-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './email-input.html',
  providers: [provideInputValueAccessor(() => EmailInput), provideInputValidator(() => EmailInput)],
  hostDirectives: [{ directive: FormValidation, inputs: ['useValidation'] }],
})
export class EmailInput extends BaseInput implements Validator {
  protected readonly type = 'email';

  /** Inline error: only once the field has been touched and holds an invalid value. */
  protected readonly _invalid = computed(
    () => this._touched() && this._value().length > 0 && !EMAIL_PATTERN.test(this._value()),
  );

  validate(control: AbstractControl): ValidationErrors | null {
    const value = control.value as string;
    if (!value) {
      return null;
    }
    return EMAIL_PATTERN.test(value) ? null : { email: true };
  }
}
