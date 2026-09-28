import { RecurringRule } from '../models/recurring';
import {
  DailyReminderState,
  billReminder,
  billReminderKey,
  dailyReminderDue,
  isTimeOfDay,
  msUntilTime,
} from './reminders';

describe('reminders (NTF-01, NTF-03)', () => {
  describe('isTimeOfDay', () => {
    it('accepts 24-hour HH:mm only', () => {
      expect(isTimeOfDay('00:00')).toBe(true);
      expect(isTimeOfDay('20:30')).toBe(true);
      expect(isTimeOfDay('23:59')).toBe(true);
      expect(isTimeOfDay('24:00')).toBe(false);
      expect(isTimeOfDay('8:00')).toBe(false);
      expect(isTimeOfDay('20:60')).toBe(false);
      expect(isTimeOfDay(2000)).toBe(false);
    });
  });

  describe('msUntilTime', () => {
    it('counts to the time on the same local date, negative once it has passed', () => {
      const now = new Date(2026, 8, 28, 19, 30);
      expect(msUntilTime('20:00', now)).toBe(30 * 60_000);
      expect(msUntilTime('19:30', now)).toBe(0);
      expect(msUntilTime('08:00', now)).toBe(-(11 * 60 + 30) * 60_000);
    });
  });

  describe('dailyReminderDue (NTF-01)', () => {
    const state = (overrides: Partial<DailyReminderState> = {}): DailyReminderState => ({
      enabled: true,
      time: '20:00',
      now: new Date(2026, 8, 28, 20, 5),
      today: '2026-09-28',
      loggedToday: false,
      lastShown: '2026-09-27',
      ...overrides,
    });

    it('is due once the time has come and nothing is logged for today', () => {
      expect(dailyReminderDue(state())).toBe(true);
      expect(dailyReminderDue(state({ now: new Date(2026, 8, 28, 20, 0) }))).toBe(true);
      expect(dailyReminderDue(state({ lastShown: null }))).toBe(true);
    });

    it('waits for the time, and stays quiet when off, logged or already shown today', () => {
      expect(dailyReminderDue(state({ now: new Date(2026, 8, 28, 19, 59) }))).toBe(false);
      expect(dailyReminderDue(state({ enabled: false }))).toBe(false);
      expect(dailyReminderDue(state({ loggedToday: true }))).toBe(false);
      expect(dailyReminderDue(state({ lastShown: '2026-09-28' }))).toBe(false);
      expect(dailyReminderDue(state({ time: 'soon' }))).toBe(false);
    });
  });

  describe('billReminder (NTF-03)', () => {
    const rule = (overrides: Partial<RecurringRule> = {}): RecurringRule => ({
      id: 'rent',
      template: {
        type: 'expense',
        amount: 2_000_000,
        accountId: 'bank',
        toAccountId: null,
        categoryId: 'exp_housing',
        payee: 'Landlord',
        note: null,
        tags: [],
      },
      frequency: 'monthly',
      interval: 1,
      weekdays: [],
      dayOfMonth: 1,
      startDate: '2026-01-01',
      endType: 'never',
      endDate: null,
      maxCount: null,
      occurrences: 8,
      nextDueDate: '2026-10-01',
      mode: 'confirm',
      active: true,
      createdAt: null,
      updatedAt: null,
      ...overrides,
    });

    it('reminds the day before the next entry is due', () => {
      expect(billReminder(rule(), '2026-09-30')).toEqual({
        ruleId: 'rent',
        kind: 'upcoming',
        date: '2026-10-01',
        count: 1,
      });
      expect(billReminder(rule(), '2026-09-29')).toBeNull();
    });

    it('reminds on the due date, and once for a catch-up of missed dates', () => {
      expect(billReminder(rule(), '2026-10-01')).toEqual({
        ruleId: 'rent',
        kind: 'due',
        date: '2026-10-01',
        count: 1,
      });
      // Closed through two due dates: one reminder, named after the latest.
      expect(billReminder(rule(), '2026-11-15')).toEqual({
        ruleId: 'rent',
        kind: 'due',
        date: '2026-11-01',
        count: 2,
      });
    });

    it('leaves out automatic, paused and ended rules', () => {
      expect(billReminder(rule({ mode: 'auto' }), '2026-10-01')).toBeNull();
      expect(billReminder(rule({ active: false }), '2026-10-01')).toBeNull();
      expect(billReminder(rule({ endType: 'count', maxCount: 8 }), '2026-10-01')).toBeNull();
      expect(
        billReminder(rule({ endType: 'until', endDate: '2026-09-30' }), '2026-09-30'),
      ).toBeNull();
    });

    it('keys each reminder by rule, kind and date', () => {
      const reminder = billReminder(rule(), '2026-09-30')!;
      expect(billReminderKey(reminder)).toBe('rent|upcoming|2026-10-01');
    });
  });
});
