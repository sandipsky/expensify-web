import {
  Directive,
  ElementRef,
  OnDestroy,
  Renderer2,
  afterNextRender,
  booleanAttribute,
  inject,
  input,
} from '@angular/core';
import { AbstractControl, NgControl, ValidationErrors } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

/**
 * Renders inline validation feedback for a bound form control: a `*` on the
 * label when the control is required, an error state on the field, and a
 * message below it once the control is touched/dirty and invalid.
 *
 * Applied automatically to every LumenUI input via `hostDirectives`, so it sits
 * on the `l-*` host element where the `formControl`/`formControlName`/`ngModel`
 * binding (and therefore the `NgControl`) lives. The DOM lookups fall back to a
 * descendant search so the directive also works when placed directly on a
 * native `input`/`textarea`.
 */
@Directive({
  selector: `
    input[formControlName], input[formControl], input[ngModel],
    textarea[formControlName], textarea[formControl], textarea[ngModel]
  `,
})
export class FormValidation implements OnDestroy {
  /** Set to false to opt a single field out of the inline validation UI. */
  readonly useValidation = input(true, { transform: booleanAttribute });

  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _renderer = inject(Renderer2);
  private readonly _ngControl = inject(NgControl, { optional: true });

  private _errorEl: HTMLElement | null = null;
  private _asteriskEl: HTMLElement | null = null;
  private readonly _destroy$ = new Subject<void>();

  constructor() {
    // Defer until the host component's view (label, .form-group, .form-control)
    // has rendered, otherwise the DOM lookups below find nothing.
    afterNextRender(() => this._init());
  }

  ngOnDestroy(): void {
    this._destroy$.next();
    this._destroy$.complete();
    this._removeError();
    this._removeAsterisk();
  }

  private _init(): void {
    const control = this._ngControl?.control;
    if (!this.useValidation() || !control) return;

    control.events.pipe(takeUntil(this._destroy$)).subscribe(() => this._refresh());
    this._refresh();
  }

  private _refresh(): void {
    const control = this._ngControl?.control;
    if (!control) return;

    if (this._isRequired()) this._addAsterisk();
    else this._removeAsterisk();

    const message = control.errors ? this._messageFor(control.errors) : null;
    const show = !!message && (control.touched || control.dirty);

    if (show) {
      this._renderer.addClass(this._controlEl, 'error');
      this._showError(message);
    } else {
      this._renderer.removeClass(this._controlEl, 'error');
      this._removeError();
    }
  }

  /** Maps the first matching validator error to a human message. */
  private _messageFor(errors: ValidationErrors): string | null {
    if (errors['required'] || errors['requiredTrue']) return 'This field is required.';
    if (errors['minlength'])
      return `Must be at least ${errors['minlength'].requiredLength} characters.`;
    if (errors['maxlength'])
      return `Must be no more than ${errors['maxlength'].requiredLength} characters.`;
    if (errors['min']) return `Must be at least ${errors['min'].min}.`;
    if (errors['max']) return `Must be no more than ${errors['max'].max}.`;
    if (errors['pattern']) return 'Please match the required format.';
    // `email` is intentionally omitted — l-email-input renders its own format message.
    return null;
  }

  private _isRequired(): boolean {
    const control = this._ngControl?.control;
    if (!control?.validator) return false;
    const result = control.validator({ value: null } as AbstractControl);
    return !!(result?.['required'] || result?.['requiredTrue']);
  }

  // --- DOM lookups (resolve upward for native inputs, downward for l-* hosts) ---

  private _query<T extends HTMLElement>(selector: string): T | null {
    const host = this._host.nativeElement;
    return (host.closest(selector) as T | null) ?? host.querySelector<T>(selector);
  }

  private get _formGroup(): HTMLElement | null {
    return this._query('.form-group');
  }

  private get _controlEl(): HTMLElement {
    const host = this._host.nativeElement;
    if (host.matches('.form-control')) return host;
    return host.querySelector<HTMLElement>('.form-control') ?? host;
  }

  private _showError(message: string): void {
    if (this._errorEl) {
      this._renderer.setProperty(this._errorEl, 'textContent', message);
      return;
    }

    const div = this._renderer.createElement('div') as HTMLElement;
    this._renderer.addClass(div, 'alert');
    this._renderer.addClass(div, 'error');
    this._renderer.appendChild(div, this._renderer.createText(message));

    const group = this._formGroup;
    if (group) {
      this._renderer.appendChild(group, div);
    } else {
      const anchor = this._controlEl;
      this._renderer.insertBefore(anchor.parentNode, div, anchor.nextSibling);
    }
    this._errorEl = div;
  }

  private _removeError(): void {
    if (!this._errorEl) return;
    this._renderer.removeChild(this._errorEl.parentNode, this._errorEl);
    this._errorEl = null;
  }

  private _addAsterisk(): void {
    if (this._asteriskEl) return;

    const label = this._formGroup?.querySelector<HTMLLabelElement>(':scope > label');
    if (!label) return;

    const existing = label.querySelector<HTMLElement>('.required-asterisk');
    if (existing) {
      this._asteriskEl = existing;
      return;
    }

    const span = this._renderer.createElement('span') as HTMLElement;
    this._renderer.addClass(span, 'required-asterisk');
    this._renderer.appendChild(span, this._renderer.createText(' *'));
    this._renderer.appendChild(label, span);
    this._asteriskEl = span;
  }

  private _removeAsterisk(): void {
    if (!this._asteriskEl) return;
    this._renderer.removeChild(this._asteriskEl.parentNode, this._asteriskEl);
    this._asteriskEl = null;
  }
}
