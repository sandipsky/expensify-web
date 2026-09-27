import { Directive, Type, computed, forwardRef, input, output, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALIDATORS, NG_VALUE_ACCESSOR } from '@angular/forms';

let _uid = 0;

/**
 * Registers a concrete input component as the value accessor for itself, so it
 * works with both `[(ngModel)]` and reactive forms. Pass a thunk because the
 * component class isn't defined yet when its own `providers` are evaluated.
 */
export function provideInputValueAccessor(component: () => Type<unknown>) {
  return {
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(component),
    multi: true,
  };
}

/**
 * Registers a concrete input component as a `Validator` for its own bound
 * control, so format errors (e.g. email) surface in `ngModel`/reactive forms.
 */
export function provideInputValidator(component: () => Type<unknown>) {
  return {
    provide: NG_VALIDATORS,
    useExisting: forwardRef(component),
    multi: true,
  };
}

/**
 * Shared logic for all LumenUI text-like inputs. Holds the common inputs,
 * native event outputs and the `ControlValueAccessor` bridge; concrete
 * components (`TextInput`, …) extend this and set {@link type}.
 */
@Directive()
export abstract class BaseInput implements ControlValueAccessor {
  /** Native input `type` — set by the concrete subclass. */
  protected abstract readonly type: string;

  readonly label = input<string>('');
  readonly placeholder = input<string>('');
  readonly disabled = input<boolean>(false);
  readonly id = input<string>(`l-input-${_uid++}`);

  /** Render the value as plain text instead of the input. */
  readonly viewMode = input(false);

  /** Custom text shown in view mode; falls back to the value when omitted. */
  readonly viewValue = input<string>();

  readonly input = output<Event>();
  readonly change = output<Event>();
  readonly keyup = output<KeyboardEvent>();
  readonly keydown = output<KeyboardEvent>();
  readonly keypress = output<KeyboardEvent>();
  readonly enter = output<KeyboardEvent>();

  protected readonly _value = signal('');
  protected readonly _disabledByForm = signal(false);
  protected readonly _touched = signal(false);

  protected readonly _isDisabled = computed(() => this.disabled() || this._disabledByForm());

  private _onChange: (value: string) => void = () => {};
  private _onTouched: () => void = () => {};

  protected _handleInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this._value.set(value);
    this._onChange(value);
    this.input.emit(event);
  }

  protected _handleEnter(event: Event): void {
    this.enter.emit(event as KeyboardEvent);
  }

  protected _handleBlur(): void {
    this._touched.set(true);
    this._onTouched();
  }

  writeValue(value: string | null): void {
    this._value.set(value ?? '');
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

/**
 * Shared logic for boolean LumenUI controls (`Toggle`, `Checkbox`). Bridges a
 * `checked` state to a boolean `ControlValueAccessor` and exposes the common
 * label/disabled inputs plus `labelPosition`.
 */
@Directive()
export abstract class BaseBooleanInput implements ControlValueAccessor {
  readonly label = input<string>('');
  readonly disabled = input<boolean>(false);
  readonly id = input<string>(`l-input-${_uid++}`);

  /** Where the label sits relative to the control. */
  readonly labelPosition = input<'left' | 'right' | 'top'>('right');

  /** Render the state as plain "Yes"/"No" text instead of the control. */
  readonly viewMode = input(false);

  /** Custom text shown in view mode; falls back to "Yes"/"No" when omitted. */
  readonly viewValue = input<string>();

  readonly change = output<boolean>();

  protected readonly _checked = signal(false);
  protected readonly _disabledByForm = signal(false);
  protected readonly _touched = signal(false);

  protected readonly _isDisabled = computed(() => this.disabled() || this._disabledByForm());

  private _onChange: (value: boolean) => void = () => {};
  private _onTouched: () => void = () => {};

  protected _handleChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this._checked.set(checked);
    this._onChange(checked);
    this.change.emit(checked);
  }

  protected _handleBlur(): void {
    this._touched.set(true);
    this._onTouched();
  }

  writeValue(value: boolean | null): void {
    this._checked.set(!!value);
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this._onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this._onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this._disabledByForm.set(isDisabled);
  }
}

/** A single selectable option in a radio group. */
export interface RadioOption {
  label: string;
  value: unknown;
  /** Disable just this option while leaving the rest of the group interactive. */
  disabled?: boolean;
}

/**
 * Shared logic for a radio group. Renders one radio per {@link options} entry
 * and bridges the selected option's `value` to a `ControlValueAccessor`.
 */
@Directive()
export abstract class BaseRadioInput implements ControlValueAccessor {
  /** Optional group label rendered above the options. */
  readonly label = input<string>('');
  readonly options = input<RadioOption[]>([]);

  /** Native `name` shared across the group so only one option can be selected. */
  readonly name = input<string>(`l-radio-${_uid++}`);
  readonly disabled = input<boolean>(false);
  /** Where each option label sits relative to its control. */
  readonly labelPosition = input<'left' | 'right' | 'top'>('right');

  /** `inline` lays options out in a row (default); `stacked` in a column. */
  readonly orientation = input<'inline' | 'stacked'>('inline');

  /** Render the selected option's label as plain text instead of the radio group. */
  readonly viewMode = input(false);

  /** Custom text shown in view mode; falls back to the selected option's label when omitted. */
  readonly viewValue = input<string>();

  readonly change = output<unknown>();

  protected readonly _value = signal<unknown>(null);
  protected readonly _disabledByForm = signal(false);
  protected readonly _touched = signal(false);

  protected readonly _isDisabled = computed(() => this.disabled() || this._disabledByForm());

  /** The selected option's label — the view-mode fallback text. */
  protected readonly _selectedLabel = computed(
    () => this.options().find((option) => option.value === this._value())?.label,
  );

  protected _isChecked(value: unknown): boolean {
    return this._value() === value;
  }

  protected _select(value: unknown): void {
    this._value.set(value);
    this._onChange(value);
    this.change.emit(value);
  }

  private _onChange: (value: unknown) => void = () => {};
  private _onTouched: () => void = () => {};

  protected _handleBlur(): void {
    this._touched.set(true);
    this._onTouched();
  }

  writeValue(value: unknown): void {
    this._value.set(value);
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this._onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this._onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this._disabledByForm.set(isDisabled);
  }
}
