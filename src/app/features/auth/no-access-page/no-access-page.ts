import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { Button } from '../../../shared/components/ui/button/button';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { AuthCard } from '../auth-card/auth-card';

/**
 * `/no-access` (ADM-02): a signed-in user who is pending or disabled sees
 * why, with the email they signed in with and Sign out. The profile listener
 * moves them on the moment an admin approves them (ADM-04).
 */
@Component({
  selector: 'app-no-access-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AuthCard, Button, Icon],
  templateUrl: './no-access-page.html',
  styleUrl: './no-access-page.scss',
})
export class NoAccessPage {
  protected readonly auth = inject(AuthService);

  protected readonly disabled = computed(() => this.auth.status() === 'disabled');
  protected readonly email = computed(() => this.auth.user()?.email ?? '');
  protected readonly title = computed(() =>
    this.disabled() ? 'Access disabled' : 'Waiting for approval',
  );

  protected signOut(): void {
    void this.auth.signOut();
  }
}
