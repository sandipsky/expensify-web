import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthError, DEFAULT_AUTH_MESSAGE } from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { Button } from '../../../shared/components/ui/button/button';
import { EmailInput } from '../../../shared/components/ui/input/email-input/email-input';
import { AuthCard } from '../auth-card/auth-card';

/**
 * `/forgot-password` (AUTH-04): emails a reset link. Whether the address has
 * an account isn't revealed: an unknown email gets the same "check your
 * inbox" as a known one.
 */
@Component({
  selector: 'app-forgot-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthCard, Button, EmailInput],
  templateUrl: './forgot-password-page.html',
  styleUrl: './forgot-password-page.scss',
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);

  protected readonly configured = this.auth.configured;
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  /** The address the link went to, once it has. */
  protected readonly sentTo = signal('');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', Validators.required],
  });

  protected async send(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const email = this.form.getRawValue().email.trim();
    try {
      await this.auth.sendPasswordReset(email);
      this.sentTo.set(email);
    } catch (error) {
      if (error instanceof AuthError && error.code === 'auth/user-not-found')
        this.sentTo.set(email);
      else this.error.set(error instanceof Error ? error.message : DEFAULT_AUTH_MESSAGE);
    } finally {
      this.busy.set(false);
    }
  }
}
