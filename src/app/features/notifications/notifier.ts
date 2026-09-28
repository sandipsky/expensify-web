import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService } from '../../shared/components/ui/notification';
import { AlertInbox, AlertKind, AlertTone } from './alert-inbox';
import { BrowserNotifications } from './browser-notifications';

/** Alerts stay up longer than a save toast: they're news, not confirmation. */
export const ALERT_MS = 8000;

export interface AlertInput {
  /** Names what it's about; the same ID raised again replaces the older alert in the list. */
  id: string;
  kind: AlertKind;
  tone: AlertTone;
  title: string;
  message: string;
  /** Where the alert leads in the app. */
  link: string;
  /** The toast's button, e.g. "View". */
  actionLabel: string;
  /** What the button and a click on the system notification do; opens `link` unless given. */
  open?: () => unknown;
}

/**
 * Delivers an alert (NTF-01 to NTF-03): into the in-app list (NTF-05), and as
 * a toast, or as a system notification while the app is in a background tab
 * and the user allowed them. The callers decide whether an alert is due and
 * switched on (NTF-04).
 */
@Injectable({ providedIn: 'root' })
export class Notifier {
  private readonly inbox = inject(AlertInbox);
  private readonly browser = inject(BrowserNotifications);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);

  deliver(alert: AlertInput): void {
    const { id, kind, tone, title, message, link } = alert;
    this.inbox.add({ id, kind, tone, title, message, link });
    const open = alert.open ?? (() => this.router.navigateByUrl(link));
    if (document.visibilityState === 'hidden' && this.browser.show(title, message, id, open)) {
      return;
    }
    this.notify[tone](title, message, {
      duration: ALERT_MS,
      action: { label: alert.actionLabel, handler: () => void open() },
    });
  }
}
