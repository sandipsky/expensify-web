import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DEFAULT_AUTH_MESSAGE } from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { FIREBASE_SETUP_GUIDE } from '../../../core/firebase/firebase';
import { Button } from '../../../shared/components/ui/button/button';
import { EmailInput } from '../../../shared/components/ui/input/email-input/email-input';
import { PasswordInput } from '../../../shared/components/ui/input/password-input/password-input';
import { AuthCard } from '../auth-card/auth-card';

/**
 * Where a signed-out user was heading is only followed if it's a path in this
 * app, never another site (AUTH-06).
 */
export function safeReturnUrl(url: string | undefined): string {
  return url && url.startsWith('/') && !url.startsWith('//') ? url : '/';
}

/**
 * `/login` (AUTH-01, AUTH-03): email and password, or Google, with links to
 * register and to reset the password (AUTH-04). After signing in, the user
 * goes back to the page they asked for (AUTH-06).
 */
@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthCard, Button, EmailInput, PasswordInput],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** The page to go back to after signing in, from `?returnUrl=` (AUTH-06). */
  readonly returnUrl = input<string>();
  /** Set (`?deleted=1`) when the user just deleted their account (AUTH-07). */
  readonly deleted = input<string>();

  protected readonly configured = this.auth.configured;
  protected readonly guide = FIREBASE_SETUP_GUIDE;
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', Validators.required],
    password: ['', Validators.required],
  });

  protected signIn(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    void this.attempt(() => this.auth.signIn(email, password));
  }

  protected signInWithGoogle(): void {
    void this.attempt(() => this.auth.signInWithGoogle());
  }

  private async attempt(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : DEFAULT_AUTH_MESSAGE);
    } finally {
      this.busy.set(false);
    }
  }
}
