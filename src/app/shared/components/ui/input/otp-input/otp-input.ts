import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  input,
  output,
  signal,
  viewChildren,
} from '@angular/core';
import { ControlValueAccessor } from '@angular/forms';
import { provideInputValueAccessor } from '../input';

export type OtpSize = 'sm' | 'md' | 'lg';
/** `number` restricts entry to digits; `text` allows any non-space character. */
export type OtpType = 'number' | 'text';

let _uid = 0;

/**
 * OTP / PIN input — a row of single-character boxes for one-time codes and
 * PINs, in the spirit of Ant Design's `Input.OTP` and Mantine's `PinInput`.
 * Typing advances to the next box, Backspace walks back, arrow keys move the
 * caret, and pasting a code distributes it across the boxes. Set `mask` to hide
 * the entered characters (dots) for PIN entry. Bridges to `ControlValueAccessor`
 * so it works with `[(ngModel)]` and reactive forms.
 *
 * ```html
 * <l-otp-input [length]="6" [(ngModel)]="code" (completed)="verify($event)" />
 * <l-otp-input [length]="4" [mask]="true" type="number" />
 * ```
 */
@Component({
  selector: 'l-otp-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './otp-input.html',
  styleUrl: './otp-input.scss',
  providers: [provideInputValueAccessor(() => OtpInput)],
  host: {
    '[class]': '_hostClasses()',
    role: 'group',
    '[attr.aria-label]': 'ariaLabel()',
  },
})
export class OtpInput implements ControlValueAccessor {
  /** Number of character boxes. */
  readonly length = input(6);
  readonly type = input<OtpType>('number');
  /** Hide the entered characters as dots (PIN mode). */
  readonly mask = input(false);
  readonly size = input<OtpSize>('md');
  readonly disabled = input(false);
  /** Paint the boxes in the error color. */
  readonly error = input(false);
  /** Focus the first box on render. */
  readonly autoFocus = input(false);
  /** A `-` between every box, e.g. `123-456`. */
  readonly separator = input(false);
  readonly ariaLabel = input<string>('One-time code');
  readonly name = input<string>(`l-otp-${_uid++}`);

  /** Emits the full value on every change. */
  readonly change = output<string>();
  /** Emits once every box is filled. */
  readonly completed = output<string>();

  protected readonly _chars = signal<string[]>([]);
  protected readonly _disabledByForm = signal(false);

  protected readonly _isDisabled = computed(() => this.disabled() || this._disabledByForm());
  protected readonly _inputType = computed(() => (this.mask() ? 'password' : 'text'));
  protected readonly _inputMode = computed(() => (this.type() === 'number' ? 'numeric' : 'text'));

  protected readonly _hostClasses = computed(() => {
    const classes = ['l-otp', `l-otp--${this.size()}`];
    if (this.error()) classes.push('is-error');
    if (this._isDisabled()) classes.push('is-disabled');
    return classes.join(' ');
  });

  private readonly _cells = viewChildren<ElementRef<HTMLInputElement>>('cell');

  private _onChange: (value: string) => void = () => {};
  private _onTouched: () => void = () => {};

  constructor() {
    // Keep the backing array sized to `length`, preserving already-typed chars.
    effect(() => {
      const len = this.length();
      this._chars.update((prev) => {
        const next = prev.slice(0, len);
        while (next.length < len) next.push('');
        return next;
      });
    });

    afterNextRender(() => {
      if (this.autoFocus() && !this._isDisabled()) this._focus(0);
    });
  }

  protected _onInput(event: Event, index: number): void {
    const el = event.target as HTMLInputElement;
    const char = el.value.slice(-1);
    if (char && !this._isAllowed(char)) {
      el.value = this._chars()[index] ?? '';
      return;
    }
    this._setChar(index, char);
    if (char) this._focus(index + 1);
  }

  protected _onKeydown(event: KeyboardEvent, index: number): void {
    switch (event.key) {
      case 'Backspace':
        event.preventDefault();
        if (this._chars()[index]) {
          this._setChar(index, '');
        } else if (index > 0) {
          this._setChar(index - 1, '');
          this._focus(index - 1);
        }
        break;
      case 'Delete':
        event.preventDefault();
        this._setChar(index, '');
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this._focus(index - 1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        this._focus(index + 1);
        break;
      case 'Home':
        event.preventDefault();
        this._focus(0);
        break;
      case 'End':
        event.preventDefault();
        this._focus(this.length() - 1);
        break;
    }
  }

  protected _onPaste(event: ClipboardEvent, index: number): void {
    event.preventDefault();
    const text = event.clipboardData?.getData('text') ?? '';
    const incoming = [...text].filter((c) => this._isAllowed(c));
    if (!incoming.length) return;

    const chars = this._chars().slice();
    let pos = index;
    for (const c of incoming) {
      if (pos >= chars.length) break;
      chars[pos++] = c;
    }
    this._commit(chars);
    this._focus(pos);
  }

  protected _onFocus(event: FocusEvent): void {
    // Select the box so the next keystroke overwrites it.
    (event.target as HTMLInputElement).select();
  }

  protected _onBlur(): void {
    this._onTouched();
  }

  private _isAllowed(char: string): boolean {
    return this.type() === 'number' ? /[0-9]/.test(char) : /\S/.test(char);
  }

  private _setChar(index: number, char: string): void {
    const chars = this._chars().slice();
    chars[index] = char;
    this._commit(chars);
  }

  private _commit(chars: string[]): void {
    this._chars.set(chars);
    const value = chars.join('');
    this._onChange(value);
    this.change.emit(value);
    if (chars.length > 0 && chars.every((c) => c !== '')) {
      this.completed.emit(value);
    }
  }

  private _focus(index: number): void {
    const clamped = Math.max(0, Math.min(index, this.length() - 1));
    const el = this._cells()[clamped]?.nativeElement;
    el?.focus();
    el?.select();
  }

  writeValue(value: string | null): void {
    const chars = [...(value ?? '')].slice(0, this.length());
    while (chars.length < this.length()) chars.push('');
    this._chars.set(chars);
  }

  registerOnChange(fn: (value: string) => void): void {
    this._onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this._onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this._disabledByForm.set(isDisabled);
  }
}
