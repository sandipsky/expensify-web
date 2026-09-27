import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormValidation } from '../../../../directives/form-validation';
import { BaseInput, provideInputValueAccessor } from '../input';

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
}
