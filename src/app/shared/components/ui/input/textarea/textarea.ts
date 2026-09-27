import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormValidation } from '../../../../directives/form-validation';
import { BaseInput, provideInputValueAccessor } from '../input';

@Component({
  selector: 'l-textarea',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './textarea.html',
  styleUrl: './textarea.scss',
  providers: [provideInputValueAccessor(() => Textarea)],
  hostDirectives: [{ directive: FormValidation, inputs: ['useValidation'] }],
})
export class Textarea extends BaseInput {
  protected readonly type = 'text';

  /** Visible rows before the field scrolls. */
  readonly rows = input(4);

  /** Show the drag-to-resize handle (vertical only). Off by default. */
  readonly resizable = input(false);
}
