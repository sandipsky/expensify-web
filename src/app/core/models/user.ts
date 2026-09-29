import { TimestampLike } from './timestamp';

/** `users.theme` values (§8). Lowercase strings shared with Android. */
export const THEMES = ['light', 'dark', 'system'] as const;

export type Theme = (typeof THEMES)[number];

/** `users.notificationPrefs` (§8): which notifications the user gets (NTF-04, SET-07). */
export interface NotificationPrefs {
  /** Daily reminder to log expenses, opt-in (NTF-01). */
  dailyReminder: boolean;
  /** Local time of the daily reminder, 24-hour `HH:mm`. */
  reminderTime: string;
  /** Budget alerts at the budget's thresholds, 80% and 100% by default (NTF-02). */
  budgetAlerts: boolean;
  /** Reminders for ask-first recurring entries, the day before and on the day (NTF-03). */
  billReminders: boolean;
}

/**
 * `users/{uid}` (§8): the profile and preferences. Sign-in creates it with the
 * identity fields (§10 "Sign-in flow"); Settings and onboarding change the
 * preferences afterwards.
 */
export interface UserProfile {
  displayName?: string | null;
  /** Copied from Auth; shown on the profile so a typo is easy to spot (AUTH-02). */
  email?: string | null;
  photoURL?: string | null;
  /** ISO 4217, e.g. "EUR" (SET-01). */
  baseCurrency: string;
  /** BCP 47, e.g. "en-GB": how numbers, amounts and dates are written (SET-01). */
  locale: string;
  /** IANA name; server jobs use it to find the user's "today". */
  timeZone: string;
  /** 1–28 (SET-02, BR-05). */
  monthStartDay: number;
  /** ISO weekday, 1 = Monday … 7 = Sunday (SET-05). */
  weekStartDay: number;
  theme: Theme;
  onboardingCompleted: boolean;
  notificationPrefs: NotificationPrefs;
  schemaVersion: number;
  createdAt: TimestampLike | null;
  updatedAt: TimestampLike | null;
}

/** The preferences Settings changes (SET-01, SET-02, SET-05 to SET-07); each is optional. */
export interface PreferenceChanges {
  baseCurrency?: string;
  locale?: string;
  monthStartDay?: number;
  weekStartDay?: number;
  theme?: Theme;
  notificationPrefs?: Partial<NotificationPrefs>;
}

/** The identity fields the user may edit (AUTH-08); `null` clears one. */
export interface IdentityChanges {
  displayName?: string | null;
  photoURL?: string | null;
}

/**
 * What a new profile starts with. The daily reminder is opt-in (NTF-01); alerts
 * and reminders for what the user set up themselves are on.
 */
export const DEFAULT_NOTIFICATION_PREFS: Readonly<NotificationPrefs> = {
  dailyReminder: false,
  reminderTime: '20:00',
  budgetAlerts: true,
  billReminders: true,
};
