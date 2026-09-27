import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ControlValueAccessor } from '@angular/forms';
import { FormValidation } from '../../../../directives/form-validation';
import { provideInputValueAccessor } from '../input';

let _uid = 0;

const NAV_KEYS = new Set([
  'Backspace',
  'Delete',
  'Tab',
  'Enter',
  'Escape',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
]);

/**
 * Numeric field whose form value stays a plain `number`. Non-numeric keystrokes
 * are blocked outright, and an optional `prefix`/`suffix` are shown as static,
 * non-editable adornments that never become part of the value.
 */
@Component({
  selector: 'l-number-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './number-input.html',
  styleUrl: './number-input.scss',
  providers: [provideInputValueAccessor(() => NumberInput)],
  hostDirectives: [{ directive: FormValidation, inputs: ['useValidation'] }],
})
export class NumberInput implements ControlValueAccessor {
  readonly label = input<string>('');
  readonly placeholder = input<string>('');
  readonly disabled = input<boolean>(false);
  readonly id = input<string>(`l-number-${_uid++}`);

  /**
   * `0` forbids decimals; a positive number rounds the value to that many
   * places; left unset, any number of decimals is allowed.
   */
  readonly decimalPlaces = input<number>();

  /** Display-only adornments — they never change the stored value. */
  readonly prefix = input('');
  readonly suffix = input('');

  /** Allow typing negative numbers. Off by default (the `-` key is blocked). */
  readonly allowNegative = input(false);

  /** Allow a value of `0`. On by default; when off, typing a bare `0` is blocked. */
  readonly allowZero = input(true);

  /** Render the value (with `prefix`/`suffix`) as plain text instead of the input. */
  readonly viewMode = input(false);

  /** Custom text shown in view mode; falls back to the affixed value when omitted. */
  readonly viewValue = input<string>();

  readonly valueChange = output<number | null>();

  protected readonly _value = signal<number | null>(null);
  protected readonly _buffer = signal('');
  protected readonly _focused = signal(false);
  protected readonly _disabledByForm = signal(false);
  protected readonly _touched = signal(false);

  protected readonly _isDisabled = computed(() => this.disabled() || this._disabledByForm());
  protected readonly _inputMode = computed(() =>
    this.decimalPlaces() === 0 ? 'numeric' : 'decimal',
  );

  /** While focused show the editable buffer; otherwise the formatted value. */
  protected readonly _display = computed(() =>
    this._focused() ? this._buffer() : this._format(this._value()),
  );

  /** The affixed value shown in view mode. */
  protected readonly _viewText = computed(() => {
    const text = this._format(this._value());
    return text ? `${this.prefix()}${text}${this.suffix()}` : '';
  });

  private _onChange: (value: number | null) => void = () => {};
  private _onTouched: () => void = () => {};

  protected _handleKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (NAV_KEYS.has(event.key)) return;
    if (event.key.length !== 1) return;

    if (!this._isKeyAllowed(event.key, event.target as HTMLInputElement)) {
      event.preventDefault();
    }
  }

  protected _handleFocus(): void {
    this._buffer.set(this._rawString(this._value()));
    this._focused.set(true);
  }

  protected _handleInput(event: Event): void {
    const cleaned = this._sanitize((event.target as HTMLInputElement).value);
    this._buffer.set(cleaned);
    this._commit(this._parse(cleaned));
  }

  protected _handleBlur(): void {
    let value = this._value();

    const places = this.decimalPlaces();
    if (value !== null && places !== undefined) value = this._round(value, places);
    if (value === 0 && !this.allowZero()) value = null;

    this._commit(value);
    this._focused.set(false);

    this._touched.set(true);
    this._onTouched();
  }

  writeValue(value: number | null): void {
    this._value.set(typeof value === 'number' && !Number.isNaN(value) ? value : null);
    if (this._focused()) this._buffer.set(this._rawString(this._value()));
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this._onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this._onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this._disabledByForm.set(isDisabled);
  }

  /** Decides whether a printable key may be inserted at the current caret/selection. */
  private _isKeyAllowed(key: string, input: HTMLInputElement): boolean {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const prospective = input.value.slice(0, start) + key + input.value.slice(end);

    if (key === '-') {
      return this.allowNegative() && start === 0 && !input.value.includes('-');
    }

    if (key === '.') {
      return this.decimalPlaces() !== 0 && !input.value.includes('.');
    }

    if (key >= '0' && key <= '9') {
      if (!this.allowZero() && this._parse(this._sanitize(prospective)) === 0) return false;
      return true;
    }

    return false;
  }

  private _commit(value: number | null): void {
    this._value.set(value);
    this._onChange(value);
    this.valueChange.emit(value);
  }

  private _rawString(value: number | null): string {
    return value === null ? '' : String(value);
  }

  /** Safety net for pasted text — strips anything the keystroke filter would have blocked. */
  private _sanitize(raw: string): string {
    const negative = this.allowNegative() && raw.trimStart().startsWith('-');
    let s = raw.replace(/[^0-9.]/g, '');

    if (this.decimalPlaces() === 0) {
      s = s.replace(/\./g, '');
    } else {
      const dot = s.indexOf('.');
      if (dot !== -1) {
        s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
      }
    }

    s = s.replace(/^0+(?=\d)/, '');
    return (negative ? '-' : '') + s;
  }

  private _parse(s: string): number | null {
    if (s === '' || s === '-' || s === '.' || s === '-.') return null;
    const n = Number(s);
    return Number.isNaN(n) ? null : n;
  }

  private _round(value: number, places: number): number {
    const factor = 10 ** places;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  private _format(value: number | null): string {
    if (value === null) return '';
    const places = this.decimalPlaces();
    return places !== undefined ? value.toFixed(places) : String(value);
  }
}
