import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { Preferences } from '../preferences';
import { LocalDb } from './local-db';
import { StoredProfile, UsersRepo } from './users.repo';

describe('UsersRepo and Preferences (§8 users/{uid}, SET-01 to SET-07)', () => {
  let db: LocalDb;
  let repo: UsersRepo;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    db = TestBed.inject(LocalDb);
    repo = TestBed.inject(UsersRepo);
  });

  const profile = () => firstValueFrom(repo.watchProfile());
  const stored = async () => (await db.get('users')).find((d) => d.id === 'local')?.data;

  it('reads defaults until a profile exists, then creates it on the first save', async () => {
    const prefs = TestBed.inject(Preferences);
    expect(await profile()).toBeNull();
    expect(prefs.baseCurrency()).toBe('NPR');
    expect(prefs.monthStartDay()).toBe(1);
    expect(prefs.theme()).toBe('system');
    expect(prefs.notifications()).toEqual({
      dailyReminder: false,
      reminderTime: '20:00',
      budgetAlerts: true,
      billReminders: true,
    });

    prefs.save({ monthStartDay: 25 });
    expect(prefs.monthStartDay()).toBe(25);
    expect(await stored()).toMatchObject({
      baseCurrency: 'NPR',
      monthStartDay: 25,
      weekStartDay: 1,
      theme: 'system',
      schemaVersion: 1,
      notificationPrefs: { dailyReminder: false, reminderTime: '20:00' },
    });
    expect((await stored())?.['createdAt']).toBeTruthy();
  });

  it('saves only the preferences passed, merging notification preferences (SYN-03)', async () => {
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
    TestBed.inject(Preferences).save({ theme: 'light' });
    await repo.delete();
    expect(await profile()).toBeNull();
    expect(TestBed.inject(Preferences).theme()).toBe('system');
  });
});
