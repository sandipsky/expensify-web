import { Injectable, inject } from '@angular/core';
import { Observable, map, of, shareReplay, switchMap } from 'rxjs';
import { SCHEMA_VERSION } from '../domain/backup';
import { isCurrencyCode } from '../domain/money';
import { clampStartDay, clampWeekday } from '../domain/period';
import { isTimeOfDay } from '../domain/reminders';
import { TimestampLike } from '../models/timestamp';
import {
  DEFAULT_NOTIFICATION_PREFS,
  IdentityChanges,
  NotificationPrefs,
  PreferenceChanges,
  THEMES,
  Theme,
  UserProfile,
} from '../models/user';
import { Db, Doc, DocData, serverTimestamp } from './db';
import { WriteErrors } from './write-errors';

/** The fields a new profile is written with; the timestamps and schema version are added. */
export type NewProfile = Omit<UserProfile, 'createdAt' | 'updatedAt' | 'schemaVersion'>;

/**
 * The profile as stored, checked field by field: a field that's missing or
 * that this version can't read (a newer app's theme, say) is left out, so the
 * reader falls back to its default instead of breaking.
 */
export type StoredProfile = Partial<UserProfile>;

/** The signed-in user's profile document as the listener sees it. */
export interface ProfileSnapshot {
  uid: string;
  /** `null` while the document doesn't exist. */
  profile: StoredProfile | null;
  /** True while only the cache has answered; a missing profile is only certain once this is false. */
  fromCache: boolean;
}

/**
 * `users/{uid}` (§8), the profile document. Sign-in creates it (§10 "Sign-in
 * flow"). Preferences are written field by field with a merging set, so
 * another device's change to a different preference survives (SYN-03).
 * Writes return before they're confirmed and hand failures to `WriteErrors`
 * (NFR-03).
 */
@Injectable({ providedIn: 'root' })
export class UsersRepo {
  private readonly db = inject(Db);
  private readonly errors = inject(WriteErrors);

  /**
   * The signed-in user's profile, live, following sign-in and sign-out; `null`
   * while signed out. One listener serves every subscriber.
   */
  private readonly profile$ = this.db.uid$.pipe(
    switchMap((uid) =>
      uid
        ? this.db.watchDoc(`users/${uid}`).pipe(
            map(({ doc, fromCache }): ProfileSnapshot => ({
              uid,
              profile: doc ? toProfile(doc) : null,
              fromCache,
            })),
          )
        : of(null),
    ),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  watchProfile(): Observable<ProfileSnapshot | null> {
    return this.profile$;
  }

  /** Writes the signed-in user's profile for the first time. */
  create(profile: NewProfile): void {
    this.commit({
      ...profile,
      schemaVersion: SCHEMA_VERSION,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  /**
   * Saves the preferences passed and no others; `notificationPrefs` merges
   * into the stored map. Also records the device's time zone, which server jobs
   * use to find the user's "today" (§8).
   */
  update(changes: PreferenceChanges, timeZone: string): void {
    this.commit({ ...changes, timeZone, updatedAt: serverTimestamp() }, true);
  }

  /** Saves a new display name or photo (AUTH-08). */
  updateIdentity(changes: IdentityChanges): void {
    this.commit({ ...changes, updatedAt: serverTimestamp() }, true);
  }

  /** Marks onboarding done, so it's skipped from now on (ONB-04). */
  completeOnboarding(): void {
    this.commit({ onboardingCompleted: true, updatedAt: serverTimestamp() }, true);
  }

  /** Deletes the profile, the last step of deleting the account (SET-04, §12). */
  delete(): Promise<void> {
    return this.db.batch().delete(this.db.userPath).commit();
  }

  // Not awaited: offline, a commit resolves only once the server confirms (§10).
  private commit(data: DocData, merge = false): void {
    this.db
      .batch()
      .set(this.db.userPath, data, { merge })
      .commit()
      .catch((error) => this.errors.report(error));
  }
}

function toProfile(doc: Doc): StoredProfile {
  const data = doc.data as Record<string, unknown>;
  const profile: StoredProfile = {};
  for (const field of ['displayName', 'email', 'photoURL', 'timeZone'] as const) {
    if (typeof data[field] === 'string') profile[field] = data[field];
  }
  if (isCurrencyCode(data['baseCurrency'])) profile.baseCurrency = data['baseCurrency'];
  if (isLocale(data['locale'])) profile.locale = data['locale'];
  if (typeof data['monthStartDay'] === 'number') {
    profile.monthStartDay = clampStartDay(data['monthStartDay']);
  }
  if (typeof data['weekStartDay'] === 'number') {
    profile.weekStartDay = clampWeekday(data['weekStartDay']);
  }
  if (THEMES.includes(data['theme'] as Theme)) profile.theme = data['theme'] as Theme;
  if (typeof data['onboardingCompleted'] === 'boolean') {
    profile.onboardingCompleted = data['onboardingCompleted'];
  }
  profile.notificationPrefs = toNotificationPrefs(data['notificationPrefs']);
  if (typeof data['schemaVersion'] === 'number') profile.schemaVersion = data['schemaVersion'];
  profile.createdAt = timestampOf(data['createdAt']);
  profile.updatedAt = timestampOf(data['updatedAt']);
  return profile;
}

function timestampOf(value: unknown): TimestampLike | null {
  return value && typeof (value as TimestampLike).toMillis === 'function'
    ? (value as TimestampLike)
    : null;
}

/** Each preference as stored, or its default where it's missing or unreadable. */
function toNotificationPrefs(value: unknown): NotificationPrefs {
  const stored = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const flag = (key: keyof NotificationPrefs) =>
    typeof stored[key] === 'boolean' ? stored[key] : DEFAULT_NOTIFICATION_PREFS[key];
  return {
    dailyReminder: flag('dailyReminder') as boolean,
    reminderTime: isTimeOfDay(stored['reminderTime'])
      ? stored['reminderTime']
      : DEFAULT_NOTIFICATION_PREFS.reminderTime,
    budgetAlerts: flag('budgetAlerts') as boolean,
    billReminders: flag('billReminders') as boolean,
  };
}

function isLocale(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}
