import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DEFAULT_AUTH_MESSAGE } from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { Button } from '../../../shared/components/ui/button/button';
import { EmailInput } from '../../../shared/components/ui/input/email-input/email-input';
import { PasswordInput } from '../../../shared/components/ui/input/password-input/password-input';
import { TextInput } from '../../../shared/components/ui/input/text-input/text-input';
import { AuthCard } from '../auth-card/auth-card';

/** Passwords need at least this many characters (AUTH-01). */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * `/register` (AUTH-01): name, email and a password of at least 8 characters
 * with the strength checklist. No verification email follows (AUTH-02): the
 * new account goes straight on to onboarding.
 */
@Component({
  selector: 'app-register-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    AuthCard,
    Button,
    EmailInput,
    PasswordInput,
    TextInput,
  ],
  templateUrl: './register-page.html',
  styleUrl: './register-page.scss',
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly configured = this.auth.configured;
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(60)]],
    email: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
  });

  protected async register(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const { name, email, password } = this.form.getRawValue();
    try {
      await this.auth.register(name, email, password);
      // The guards decide between onboarding and waiting for approval.
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : DEFAULT_AUTH_MESSAGE);
    } finally {
      this.busy.set(false);
    }
  }
}
