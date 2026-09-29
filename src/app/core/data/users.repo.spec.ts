import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { Preferences } from '../preferences';
import { LocalDb } from './local-db';
import { NewProfile, StoredProfile, UsersRepo } from './users.repo';

const newProfile = (overrides: Partial<NewProfile> = {}): NewProfile => ({
  displayName: 'Ada',
  email: 'ada@example.com',
  photoURL: null,
  baseCurrency: 'NPR',
  locale: 'en-US',
  timeZone: 'Asia/Kathmandu',
  monthStartDay: 1,
  weekStartDay: 1,
  theme: 'system',
  onboardingCompleted: false,
  notificationPrefs: {
    dailyReminder: false,
    reminderTime: '20:00',
    budgetAlerts: true,
    billReminders: true,
  },
  ...overrides,
});

describe('UsersRepo and Preferences (§8 users/{uid}, SET-01 to SET-07)', () => {
  let db: LocalDb;
  let repo: UsersRepo;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    db = TestBed.inject(LocalDb);
    repo = TestBed.inject(UsersRepo);
  });

  const snapshot = () => firstValueFrom(repo.watchProfile());
  const profile = async () => (await snapshot())?.profile ?? null;
  const stored = async () => (await db.get('users')).find((d) => d.id === 'local')?.data;

  it('reads defaults until the profile exists, then creates it', async () => {
    const prefs = TestBed.inject(Preferences);
    expect(await snapshot()).toEqual({ uid: 'local', profile: null, fromCache: false });
    expect(prefs.loaded()).toBe(false);
    expect(prefs.baseCurrency()).toBe('NPR');
    expect(prefs.monthStartDay()).toBe(1);
    expect(prefs.theme()).toBe('system');

    repo.create(newProfile());
    expect(await stored()).toMatchObject({
      baseCurrency: 'NPR',
      schemaVersion: 1,
      onboardingCompleted: false,
    });
    expect((await stored())?.['createdAt']).toBeTruthy();
    expect(await profile()).toMatchObject({ email: 'ada@example.com', displayName: 'Ada' });
    expect(prefs.loaded()).toBe(true);
  });

  it('saves only the preferences passed, merging notification preferences (SYN-03)', async () => {
    repo.create(newProfile());
    const prefs = TestBed.inject(Preferences);
    prefs.save({ baseCurrency: 'USD' });
    const createdAt = (await stored())?.['createdAt'];

    // Another device changed the week start meanwhile; this save must keep it.
    await db.batch().update('users/local', { weekStartDay: 7 }).commit();
    prefs.save({ theme: 'dark', notificationPrefs: { dailyReminder: true } });
    prefs.save({ notificationPrefs: { reminderTime: '21:30' } });

    expect(await stored()).toMatchObject({
      baseCurrency: 'USD',
      weekStartDay: 7,
      theme: 'dark',
      notificationPrefs: {
        dailyReminder: true,
        reminderTime: '21:30',
        budgetAlerts: true,
        billReminders: true,
      },
    });
    expect((await stored())?.['createdAt']).toBe(createdAt);
    expect(typeof (await stored())?.['timeZone']).toBe('string');
    expect(prefs.theme()).toBe('dark');
    expect(prefs.weekStartDay()).toBe(7);
  });

  it('saves the name and onboarding without touching the preferences (AUTH-08, ONB-04)', async () => {
    repo.create(newProfile());
    TestBed.inject(Preferences).save({ theme: 'light' });
    repo.updateIdentity({ displayName: 'Ada L.', photoURL: null });
    repo.completeOnboarding();
    const data = await stored();
    expect(data).toMatchObject({
      displayName: 'Ada L.',
      onboardingCompleted: true,
      theme: 'light',
    });
  });

  it('leaves out values this version can’t read, so readers fall back to defaults', async () => {
    await db
      .batch()
      .set('users/local', {
        baseCurrency: 'dollars',
        locale: 'not a locale!',
        monthStartDay: 31,
        weekStartDay: 0,
        theme: 'sepia',
        notificationPrefs: { dailyReminder: 'yes', reminderTime: '25:00', billReminders: false },
      })
      .commit();
    const read = (await profile()) as StoredProfile;
    expect(read.baseCurrency).toBeUndefined();
    expect(read.locale).toBeUndefined();
    expect(read.theme).toBeUndefined();
    expect(read.monthStartDay).toBe(28);
    expect(read.weekStartDay).toBe(1);
    expect(read.notificationPrefs).toEqual({
      dailyReminder: false,
      reminderTime: '20:00',
      budgetAlerts: true,
      billReminders: false,
    });
    const prefs = TestBed.inject(Preferences);
    expect(prefs.baseCurrency()).toBe('NPR');
    expect(prefs.theme()).toBe('system');
  });

  it('deletes the profile', async () => {
    repo.create(newProfile());
    await repo.delete();
    expect(await profile()).toBeNull();
    expect(TestBed.inject(Preferences).theme()).toBe('system');
  });
});
