import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormValidation } from '../../../../directives/form-validation';
import { BaseRadioInput, provideInputValueAccessor } from '../input';

@Component({
  selector: 'l-radio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './radio.html',
  styleUrl: './radio.scss',
  providers: [provideInputValueAccessor(() => Radio)],
  hostDirectives: [{ directive: FormValidation, inputs: ['useValidation'] }],
})
export class Radio extends BaseRadioInput {}
