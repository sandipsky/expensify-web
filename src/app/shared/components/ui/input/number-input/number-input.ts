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

/** Operators `allowExpressions` accepts; `×`, `÷` and `x` are read as `*` and `/`. */
const OPERATOR_KEYS = new Set(['+', '-', '*', '/', '(', ')', 'x', 'X', '×', '÷', ' ']);

/**
 * Numeric field whose form value stays a plain `number`. Non-numeric keystrokes
 * are blocked outright, and an optional `prefix`/`suffix` are shown as static,
 * non-editable adornments that never become part of the value.
 *
 * With `allowExpressions`, simple arithmetic such as `120+45` or `3*19.99` is
 * worked out as it's typed (the form value is the result, previewed under the
 * field), and the field shows the result once it's left or Enter is pressed.
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

  /** Accept `+ − × ÷` and parentheses, and use the result as the value. */
  readonly allowExpressions = input(false);

  /** Render the value (with `prefix`/`suffix`) as plain text instead of the input. */
  readonly viewMode = input(false);

  /** Custom text shown in view mode; falls back to the affixed value when omitted. */
  readonly viewValue = input<string>();

  readonly valueChange = output<number | null>();
  /** Enter was pressed in the field, after any expression was worked out. */
  readonly enter = output<KeyboardEvent>();

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

  /** The "165.00" of "= 165.00" under the field while an expression is being typed. */
  protected readonly _result = computed(() => {
    if (!this._focused() || !this.allowExpressions() || !isExpression(this._buffer())) return '';
    const value = this._value();
    const places = this.decimalPlaces();
    if (value === null) return '';
    return this._format(places === undefined ? value : this._round(value, places));
  });

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
    // Edit the text as shown ("50.00" parses back fine). Swapping it for the raw
    // number ("50") would change the value and drop the select-all that tabbing
    // in makes, so typing would append digits instead of replacing them.
    this._buffer.set(this._format(this._value()));
    this._focused.set(true);
  }

  protected _handleInput(event: Event): void {
    const cleaned = this._sanitize((event.target as HTMLInputElement).value);
    this._buffer.set(cleaned);
    this._commit(this._parse(cleaned));
  }

  protected _handleEnter(event: Event): void {
    // Show the worked-out result in place of the expression.
    if (this.allowExpressions() && isExpression(this._buffer())) {
      this._buffer.set(this._format(this._value()));
    }
    this.enter.emit(event as KeyboardEvent);
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

    if (this.allowExpressions()) {
      if (OPERATOR_KEYS.has(key)) return true;
      // Each number in an expression may have its own decimal point; parsing checks them.
      if (key === '.') return this.decimalPlaces() !== 0;
    }

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
    if (this.allowExpressions() && isExpression(raw.replace(/[x×÷]/gi, '*'))) {
      const s = raw
        .replace(/[x×]/gi, '*')
        .replace(/÷/g, '/')
        .replace(/[^0-9.+\-*/() ]/g, '');
      return this.decimalPlaces() === 0 ? s.replace(/\./g, '') : s;
    }
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
    if (this.allowExpressions() && isExpression(s)) {
      const result = evaluate(s);
      return result === null || (result < 0 && !this.allowNegative()) ? null : result;
    }
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

/** Whether the text has an operator beyond a leading minus, so it needs working out. */
function isExpression(text: string): boolean {
  return /[+*/()]/.test(text) || /.-/.test(text.trim());
}

/**
 * Works out `+ - * /` with the usual precedence, unary minus and parentheses,
 * or returns null. An expression still being typed counts up to its last
 * complete number: `120+` is 120 and `(3+4` is 7.
 */
function evaluate(text: string): number | null {
  const trimmed = text.replace(/[\s+\-*/(]+$/, '');
  const tokens = trimmed.match(/\d*\.?\d+\.?|\d+\.|[+\-*/()]/g) ?? [];
  if (tokens.join('') !== trimmed.replace(/\s/g, '')) return null;
  let pos = 0;
  let open = 0;

  const factor = (): number | null => {
    const token = tokens[pos++];
    if (token === '-' || token === '+') {
      const value = factor();
      return value === null ? null : token === '-' ? -value : value;
    }
    if (token === '(') {
      open++;
      const value = sum();
      if (tokens[pos] === ')') {
        pos++;
        open--;
      } else if (pos < tokens.length) {
        return null;
      }
      return value;
    }
    if (token === undefined || token === ')') return null;
    const value = Number(token);
    return Number.isFinite(value) ? value : null;
  };

  const product = (): number | null => {
    let value = factor();
    while (value !== null && (tokens[pos] === '*' || tokens[pos] === '/')) {
      const op = tokens[pos++];
      const right = factor();
      if (right === null || (op === '/' && right === 0)) return null;
      value = op === '*' ? value * right : value / right;
    }
    return value;
  };

  const sum = (): number | null => {
    let value = product();
    while (value !== null && (tokens[pos] === '+' || tokens[pos] === '-')) {
      const op = tokens[pos++];
      const right = product();
      if (right === null) return null;
      value = op === '+' ? value + right : value - right;
    }
    return value;
  };

  const result = sum();
  // Unclosed parentheses are fine while typing; a stray `)` or leftover token isn't.
  if (result === null || pos < tokens.length || open < 0) return null;
  return Number.isFinite(result) ? result : null;
}
