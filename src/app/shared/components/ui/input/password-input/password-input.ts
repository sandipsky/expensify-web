import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FormValidation } from '../../../../directives/form-validation';
import { BaseInput, provideInputValueAccessor } from '../input';

@Component({
  selector: 'l-password-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './password-input.html',
  styleUrl: './password-input.scss',
  providers: [provideInputValueAccessor(() => PasswordInput)],
  hostDirectives: [{ directive: FormValidation, inputs: ['useValidation'] }],
})
export class PasswordInput extends BaseInput {
  /** Show the password-requirements checklist below the field. */
  readonly showRules = input(false);

  protected readonly _visible = signal(false);

  // Drives the native input `type`; reading the signal here keeps the binding reactive.
  protected get type(): string {
    return this._visible() ? 'text' : 'password';
  }

  protected readonly hasMinLength = computed(() => this._value().length >= 8);
  protected readonly hasUpperLower = computed(
    () => /[a-z]/.test(this._value()) && /[A-Z]/.test(this._value()),
  );
  protected readonly hasSpecialChar = computed(() => /[^A-Za-z0-9]/.test(this._value()));
  protected readonly hasNumber = computed(() => /\d/.test(this._value()));

  protected _toggleVisible(): void {
    this._visible.update((visible) => !visible);
  }
}
