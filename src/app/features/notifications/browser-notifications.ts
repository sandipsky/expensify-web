import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** The browser's permission for system notifications, or `unsupported` where it has none. */
export type NotificationPermissionState = NotificationPermission | 'unsupported';

function currentPermission(): NotificationPermissionState {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/**
 * System notifications from the page (the Notifications API), used while the
 * app is open in a background tab. Push to a closed app needs FCM and the
 * v1.1 Functions (§12). Permission is asked for only from a button press in
 * Settings, never on its own.
 */
@Injectable({ providedIn: 'root' })
export class BrowserNotifications {
  readonly permission = signal<NotificationPermissionState>(currentPermission());

  constructor() {
    // The user can change it in the browser's site settings at any time.
    const refresh = () => this.permission.set(currentPermission());
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    });
  }

  /** Asks for permission; resolves to the answer. */
  async request(): Promise<NotificationPermissionState> {
    if (typeof Notification === 'undefined') return 'unsupported';
    try {
      await Notification.requestPermission();
    } catch {
      // Older Safari takes a callback instead and rejects the promise form.
    }
    this.permission.set(currentPermission());
    return this.permission();
  }

  /**
   * Shows a system notification; resolves false where it can't, so the caller
   * shows a toast instead. `tag` replaces an earlier one with the same tag, so
   * two open tabs show it once.
   */
  show(title: string, body: string, tag: string, onClick: () => void): boolean {
    if (this.permission() !== 'granted') return false;
    try {
      const notification = new Notification(title, { body, tag, icon: 'favicon.ico' });
      notification.onclick = () => {
        window.focus();
        onClick();
        notification.close();
      };
      return true;
    } catch {
      // Android's Chrome shows notifications only from a service worker.
      return false;
    }
  }
}
