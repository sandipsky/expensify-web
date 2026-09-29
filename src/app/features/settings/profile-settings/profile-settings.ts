import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthError, DEFAULT_AUTH_MESSAGE } from '../../../core/auth/auth-errors';
import { AuthService, GOOGLE_PROVIDER, PASSWORD_PROVIDER } from '../../../core/auth/auth.service';
import { Avatar } from '../../../shared/components/ui/avatar/avatar';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { Chip } from '../../../shared/components/ui/chip';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { TextInput } from '../../../shared/components/ui/input/text-input/text-input';
import { ModalService } from '../../../shared/components/ui/modal';
import { NotificationService } from '../../../shared/components/ui/notification';
import { compressImage } from '../../../shared/files/compress-image';
import {
  PasswordDialog,
  PasswordDialogData,
  PasswordDialogResult,
} from '../password-dialog/password-dialog';

/** Profile photos are stored as a small JPEG data URL on the profile: this many pixels on the long edge. */
export const AVATAR_EDGE = 96;

/**
 * Settings › Profile (§3.1): the photo and display name (AUTH-08), the email
 * shown so a typo is easy to spot (AUTH-02), the sign-in methods (change or
 * set a password, AUTH-09; link or unlink Google, AUTH-10) and Sign out.
 */
@Component({
  selector: 'app-profile-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Avatar, Button, Card, Chip, Icon, TextInput],
  templateUrl: './profile-settings.html',
  styleUrl: './profile-settings.scss',
})
export class ProfileSettings {
  private readonly auth = inject(AuthService);
  private readonly modals = inject(ModalService);
  private readonly notify = inject(NotificationService);

  protected readonly user = this.auth.user;
  protected readonly email = computed(() => this.user()?.email ?? '');
  /** The profile's photo first (the one the user set), else the login's (Google's). */
  protected readonly photo = computed(
    () => this.auth.profile()?.photoURL || this.user()?.photoURL || '',
  );
  protected readonly hasPassword = computed(
    () => this.user()?.providers.includes(PASSWORD_PROVIDER) ?? false,
  );
  protected readonly hasGoogle = computed(
    () => this.user()?.providers.includes(GOOGLE_PROVIDER) ?? false,
  );

  /** What the name field holds; follows the login's name until edited. */
  protected readonly name = linkedSignal(() => this.user()?.displayName ?? '');
  protected readonly nameChanged = computed(
    () => this.name().trim() !== (this.user()?.displayName ?? '').trim(),
  );
  protected readonly busy = signal(false);

  protected async saveName(): Promise<void> {
    const name = this.name().trim();
    if (!name || !this.nameChanged()) return;
    await this.attempt(async () => {
      await this.auth.updateName(name);
      this.notify.success('Name updated');
    });
  }

  /** Scales the picked image down and saves it as the profile photo (AUTH-08). */
  protected async pickPhoto(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await this.attempt(async () => {
      const small = await compressImage(file, AVATAR_EDGE);
      if (!small) throw new Error('unreadable');
      this.auth.updatePhoto(await toDataUrl(small));
      this.notify.success('Photo updated');
    }, 'Couldn’t read that image. Try a JPEG or PNG.');
  }

  protected removePhoto(): void {
    this.auth.updatePhoto(null);
    this.notify.success('Photo removed');
  }

  /** Change the password after checking the current one (AUTH-09). */
  protected async changePassword(): Promise<void> {
    const result = await this.ask({
      title: 'Change password',
      confirmText: 'Change password',
      fields: 'both',
    });
    if (!result?.current || !result.next) return;
    await this.attempt(async () => {
      await this.auth.changePassword(result.current!, result.next!);
      this.notify.success('Password changed');
    });
  }

  /** Adds email and password sign-in to a Google login (AUTH-10). */
  protected async setPassword(): Promise<void> {
    const result = await this.ask({
      title: 'Set a password',
      message: `You'll be able to sign in with ${this.email()} and this password, as well as with Google.`,
      confirmText: 'Set password',
      fields: 'new',
    });
    if (!result?.next) return;
    await this.attempt(async () => {
      try {
        await this.auth.setPassword(result.next!);
      } catch (error) {
        if (!(error instanceof AuthError) || error.code !== 'auth/requires-recent-login')
          throw error;
        await this.auth.reauthenticateWithGoogle();
        await this.auth.setPassword(result.next!);
      }
      this.notify.success('Password set', 'You can now sign in either way.');
    });
  }

  protected async linkGoogle(): Promise<void> {
    await this.attempt(async () => {
      await this.auth.linkGoogle();
      this.notify.success('Google linked', 'You can now sign in either way.');
    });
  }

  protected async unlinkGoogle(): Promise<void> {
    await this.attempt(async () => {
      await this.auth.unlinkGoogle();
      this.notify.success('Google unlinked', 'Sign in with your email and password from now on.');
    });
  }

  protected signOut(): void {
    void this.auth.signOut();
  }

  private ask(data: PasswordDialogData): Promise<PasswordDialogResult | undefined> {
    return firstValueFrom(
      this.modals
        .open<PasswordDialog, PasswordDialogData, PasswordDialogResult | undefined>(
          PasswordDialog,
          {
            data,
            width: '400px',
          },
        )
        .afterClosed(),
    );
  }

  private async attempt(
    action: () => Promise<void>,
    fallback = DEFAULT_AUTH_MESSAGE,
  ): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await action();
    } catch (error) {
      this.notify.error('Couldn’t save', error instanceof AuthError ? error.message : fallback);
    } finally {
      this.busy.set(false);
    }
  }
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
