import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService, PASSWORD_PROVIDER } from '../../core/auth/auth.service';
import { ModalService } from '../../shared/components/ui/modal';
import {
  PasswordDialog,
  PasswordDialogData,
  PasswordDialogResult,
} from './password-dialog/password-dialog';

/**
 * Proves it's really the user before something irreversible or sensitive
 * (AUTH-07, AUTH-09): a password prompt for email logins, the Google window
 * otherwise. Firebase then treats the sign-in as recent.
 */
@Injectable({ providedIn: 'root' })
export class Reauth {
  private readonly auth = inject(AuthService);
  private readonly modals = inject(ModalService);

  /**
   * Resolves to false when the user cancels. Throws an `AuthError` when the
   * password is wrong or the Google window is closed.
   */
  async confirm(reason: string): Promise<boolean> {
    const user = this.auth.user();
    if (!user) return false;
    if (!user.providers.includes(PASSWORD_PROVIDER)) {
      await this.auth.reauthenticateWithGoogle();
      return true;
    }
    const result = await firstValueFrom(
      this.modals
        .open<PasswordDialog, PasswordDialogData, PasswordDialogResult | undefined>(
          PasswordDialog,
          {
            data: {
              title: 'Confirm it’s you',
              message: reason,
              confirmText: 'Continue',
              fields: 'current',
            },
            width: '400px',
          },
        )
        .afterClosed(),
    );
    if (!result?.current) return false;
    await this.auth.reauthenticateWithPassword(result.current);
    return true;
  }
}
