import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { UsersRepo } from './data/users.repo';
import {
  DEFAULT_NOTIFICATION_PREFS,
  NotificationPrefs,
  PreferenceChanges,
  Theme,
} from './models/user';

/** The currency a profile starts with until onboarding asks for one (ONB-01). */
export const DEFAULT_CURRENCY = 'NPR';

/** The browser's language, as a new profile's locale. */
export function deviceLocale(): string {
  return navigator.language || 'en-US';
}

/** The device's IANA time zone, which the profile records for server jobs (§8). */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * The profile preferences every screen formats, groups and notifies with (§8
 * `users/{uid}`), as signals over the one profile listener. A preference the
 * profile doesn't hold yet reads as its default: the device's locale, the
 * Nepalese rupee, months from the 1st, weeks from Monday, the system theme.
 * Settings changes them with `save()` (SET-01, SET-02, SET-05 to SET-07).
 */
@Injectable({ providedIn: 'root' })
export class Preferences {
  private readonly repo = inject(UsersRepo);
  /** `undefined` until the profile is read, `null` while there is none. */
  private readonly profile = toSignal(this.repo.watchProfile());

  /** False until the profile has been read. */
  readonly loaded = computed(() => this.profile() !== undefined);
  /** BCP 47 tag numbers, amounts and dates are formatted for (SET-01). */
  readonly locale = computed(() => this.profile()?.locale ?? deviceLocale());
  /** ISO 4217 code amounts are in (SET-01). */
  readonly baseCurrency = computed(() => this.profile()?.baseCurrency ?? DEFAULT_CURRENCY);
  /** Day 1–28 each month's period starts on (SET-02, BR-05). */
  readonly monthStartDay = computed(() => this.profile()?.monthStartDay ?? 1);
  /** ISO weekday weeks start on, 1 = Monday … 7 = Sunday (SET-05). */
  readonly weekStartDay = computed(() => this.profile()?.weekStartDay ?? 1);
  /** Light, dark, or following the system (SET-06). */
  readonly theme = computed<Theme>(() => this.profile()?.theme ?? 'system');
  /** Which notifications to show, and when the daily reminder comes (SET-07, NTF-04). */
  readonly notifications = computed<NotificationPrefs>(
    () => this.profile()?.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS,
  );

  /**
   * Saves the preferences passed, and only those, so another device's change
   * to a different one survives (SYN-03). The signals follow from the local
   * cache at once. Creates the profile if there's none yet.
   */
  save(changes: PreferenceChanges): void {
    // Not read yet (`undefined`) is treated like an existing profile: a merging
    // write can't overwrite what the snapshot hasn't brought in.
    if (this.profile() !== null) {
      this.repo.update(changes, deviceTimeZone());
      return;
    }
    this.repo.create({
      baseCurrency: changes.baseCurrency ?? this.baseCurrency(),
      locale: changes.locale ?? this.locale(),
      timeZone: deviceTimeZone(),
      monthStartDay: changes.monthStartDay ?? this.monthStartDay(),
      weekStartDay: changes.weekStartDay ?? this.weekStartDay(),
      theme: changes.theme ?? this.theme(),
      onboardingCompleted: false,
      notificationPrefs: { ...this.notifications(), ...changes.notificationPrefs },
    });
  }
}
