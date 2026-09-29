import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Button } from '../../../shared/components/ui/button/button';
import { PasswordInput } from '../../../shared/components/ui/input/password-input/password-input';
import { MODAL_DATA, ModalRef } from '../../../shared/components/ui/modal';
import { MIN_PASSWORD_LENGTH } from '../../auth/register-page/register-page';

export interface PasswordDialogData {
  title: string;
  message?: string;
  confirmText: string;
  /** Which passwords to ask for: the current one, a new one, or both (change password). */
  fields: 'current' | 'new' | 'both';
}

export interface PasswordDialogResult {
  current?: string;
  next?: string;
}

/**
 * Asks for a password: the current one to prove it's the user (AUTH-07,
 * AUTH-09), a new one to set (AUTH-10), or both to change it (AUTH-09).
 * Closes with the values, or with nothing on Cancel.
 */
@Component({
  selector: 'app-password-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button, PasswordInput],
  template: `
    <div class="password-dialog" [formGroup]="form">
      <h2 class="password-dialog__title">{{ data.title }}</h2>
      @if (data.message) {
        <p class="password-dialog__message">{{ data.message }}</p>
      }
      @if (data.fields !== 'new') {
        <l-password-input
          label="Current password"
          formControlName="current"
          autocomplete="current-password"
          (enter)="submit()"
        />
      }
      @if (data.fields !== 'current') {
        <l-password-input
          label="New password"
          formControlName="next"
          autocomplete="new-password"
          [showRules]="true"
          (enter)="submit()"
        />
      }
      <div class="password-dialog__actions">
        <l-button variant="outlined" (click)="ref.close(undefined)">Cancel</l-button>
        <l-button (click)="submit()">{{ data.confirmText }}</l-button>
      </div>
    </div>
  `,
  styles: `
    .password-dialog {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 20px;
    }

    .password-dialog__title {
      color: var(--text-primary);
      font-size: 18px;
      font-weight: 700;
    }

    .password-dialog__message {
      color: var(--text-secondary);
      line-height: 20px;
    }

    .password-dialog__actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `,
})
export class PasswordDialog {
  readonly ref = inject<ModalRef<PasswordDialog, PasswordDialogResult | undefined>>(ModalRef);
  readonly data = inject<PasswordDialogData>(MODAL_DATA);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    current: ['', this.data.fields === 'new' ? [] : [Validators.required]],
    next: [
      '',
      this.data.fields === 'current'
        ? []
        : [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)],
    ],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { current, next } = this.form.getRawValue();
    this.ref.close({
      current: this.data.fields === 'new' ? undefined : current,
      next: this.data.fields === 'current' ? undefined : next,
    });
  }
}
