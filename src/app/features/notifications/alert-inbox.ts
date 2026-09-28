import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { NOTIFICATION_KEYS, readState, writeState } from './device-state';

/** What raised an alert: a budget (NTF-02), an ask-first recurring entry (NTF-03), the daily reminder (NTF-01). */
export type AlertKind = 'budget' | 'bill' | 'reminder';

/** How the alert reads: `warn` and `error` for budget thresholds, `info` for reminders. */
export type AlertTone = 'info' | 'success' | 'warn' | 'error';

/** One alert in the in-app list (NTF-05). */
export interface AppAlert {
  /** Names what it's about, so the same alert raised again replaces the old one. */
  id: string;
  kind: AlertKind;
  tone: AlertTone;
  title: string;
  message: string;
  /** The app URL it leads to, e.g. `/budgets/abc`. */
  link: string | null;
  /** When it was raised, in ms since the epoch. */
  at: number;
  read: boolean;
}

/** The list keeps this many alerts, for this long. */
export const MAX_ALERTS = 50;
export const ALERT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Recent alerts in the app, newest first (NTF-05), behind the bell in the
 * header. Kept in this browser (see `device-state.ts`); open tabs share it.
 */
@Injectable({ providedIn: 'root' })
export class AlertInbox {
  private readonly _alerts = signal<AppAlert[]>(load());

  readonly alerts = this._alerts.asReadonly();
  readonly unread = computed(() => this._alerts().filter((a) => !a.read).length);

  constructor() {
    // Another tab added or read alerts.
    const sync = (event: StorageEvent) => {
      if (event.key === NOTIFICATION_KEYS.alerts) this._alerts.set(load());
    };
    window.addEventListener('storage', sync);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', sync));
  }

  /** Adds an unread alert at the top, replacing one with the same ID. */
  add(alert: Omit<AppAlert, 'at' | 'read'>, at = Date.now()): void {
    this.save([{ ...alert, at, read: false }, ...this._alerts().filter((a) => a.id !== alert.id)]);
  }

  markAllRead(): void {
    if (this.unread()) this.save(this._alerts().map((a) => (a.read ? a : { ...a, read: true })));
  }

  remove(id: string): void {
    this.save(this._alerts().filter((a) => a.id !== id));
  }

  clear(): void {
    this.save([]);
  }

  private save(alerts: AppAlert[]): void {
    const kept = prune(alerts, Date.now());
    this._alerts.set(kept);
    writeState(NOTIFICATION_KEYS.alerts, kept);
  }
}

function load(): AppAlert[] {
  const stored = readState<unknown>(NOTIFICATION_KEYS.alerts, []);
  return Array.isArray(stored) ? prune(stored.filter(isAlert), Date.now()) : [];
}

/** Newest first, at most `MAX_ALERTS`, none older than `ALERT_MAX_AGE_MS`. */
function prune(alerts: readonly AppAlert[], now: number): AppAlert[] {
  return alerts
    .filter((a) => now - a.at < ALERT_MAX_AGE_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_ALERTS);
}

function isAlert(value: unknown): value is AppAlert {
  const a = value as Partial<AppAlert> | null;
  return (
    !!a &&
    typeof a.id === 'string' &&
    typeof a.title === 'string' &&
    typeof a.message === 'string' &&
    typeof a.at === 'number' &&
    typeof a.read === 'boolean'
  );
}
