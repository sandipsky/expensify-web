import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormValidation } from '../../../../directives/form-validation';
import { BaseBooleanInput, provideInputValueAccessor } from '../input';

@Component({
  selector: 'l-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './toggle.html',
  styleUrl: './toggle.scss',
  providers: [provideInputValueAccessor(() => Toggle)],
  hostDirectives: [{ directive: FormValidation, inputs: ['useValidation'] }],
})
export class Toggle extends BaseBooleanInput {}
