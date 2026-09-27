import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormValidation } from '../../../../directives/form-validation';
import { BaseInput, provideInputValueAccessor } from '../input';

/**
 * Time of day on the browser's native time field (its picker, keyboard entry
 * and 12/24-hour display follow the user's settings). The form value is a
 * 24-hour `HH:mm` string, or `''` when cleared.
 *
 * ```html
 * <l-time-input label="Time" formControlName="time" />
 * ```
 */
@Component({
  selector: 'l-time-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './time-input.html',
  styleUrl: './time-input.scss',
  providers: [provideInputValueAccessor(() => TimeInput)],
  hostDirectives: [{ directive: FormValidation, inputs: ['useValidation'] }],
})
export class TimeInput extends BaseInput {
  protected readonly type = 'time';
}
