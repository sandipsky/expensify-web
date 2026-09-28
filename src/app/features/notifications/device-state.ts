/**
 * What this browser remembers about notifications: the alert list (NTF-05) and
 * which reminders it already showed. It isn't synced: each device shows its
 * own notifications, as each phone keeps its own notification history.
 * Reads and writes never throw, so blocked storage only costs the memory.
 */

/** Keys under which the notification features keep their state. */
export const NOTIFICATION_KEYS = {
  alerts: 'expensify.alerts.v1',
  dailyReminder: 'expensify.daily-reminder.v1',
  billReminders: 'expensify.bill-reminders.v1',
} as const;

export function readState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeState(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full: keep going from memory.
  }
}

/** Forgets every alert and reminder this browser showed, as deleting the account does. */
export function clearNotificationState(): void {
  for (const key of Object.values(NOTIFICATION_KEYS)) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing stored, or storage blocked.
    }
  }
}
