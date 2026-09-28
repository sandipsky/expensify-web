import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Preferences } from '../../../core/preferences';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { Button } from '../../../shared/components/ui/button/button';
import { DrawerRef } from '../../../shared/components/ui/drawer';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { AlertInbox, AppAlert } from '../alert-inbox';
import { ALERT_ICONS, relativeTime } from '../notification-labels';

/**
 * The in-app list of recent alerts (NTF-05), opened from the bell in the
 * header: a side panel on tablets and desktops, a bottom sheet on phones.
 * Opening it marks every alert read; the ones that were new stay marked until
 * it closes.
 */
@Component({
  selector: 'app-alerts-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, EmptyState, Icon],
  templateUrl: './alerts-panel.html',
  styleUrl: './alerts-panel.scss',
})
export class AlertsPanel {
  private readonly inbox = inject(AlertInbox);
  private readonly router = inject(Router);
  private readonly ref = inject<DrawerRef<AlertsPanel, void>>(DrawerRef, { optional: true });
  private readonly locale = inject(Preferences).locale;

  protected readonly alerts = this.inbox.alerts;
  protected readonly icons = ALERT_ICONS;
  /** Alerts that were unread when the panel opened. */
  protected readonly fresh = new Set(
    this.inbox
      .alerts()
      .filter((a) => !a.read)
      .map((a) => a.id),
  );
  private readonly now = Date.now();

  constructor() {
    this.inbox.markAllRead();
  }

  protected when(alert: AppAlert): string {
    return relativeTime(alert.at, this.now, this.locale());
  }

  protected open(alert: AppAlert): void {
    this.close();
    if (alert.link) void this.router.navigateByUrl(alert.link);
  }

  protected remove(alert: AppAlert): void {
    this.inbox.remove(alert.id);
  }

  protected clear(): void {
    this.inbox.clear();
  }

  protected settings(): void {
    this.close();
    void this.router.navigate(['/settings'], { fragment: 'notifications' });
  }

  protected close(): void {
    this.ref?.close();
  }
}
