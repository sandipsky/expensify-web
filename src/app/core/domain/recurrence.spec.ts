import { RecurringRule, RecurringTemplate, Schedule } from '../models/recurring';
import {
  dayOfMonthOf,
  dueDates,
  firstDueDate,
  firstOnOrAfter,
  isEnded,
  nextAfter,
  occurrenceId,
  occurrenceOf,
  pendingDates,
  rescheduledDueDate,
  resumedDueDate,
  scheduleAfter,
  templateOf,
  upcomingDates,
  weekdaysOf,
} from './recurrence';

const schedule = (overrides: Partial<Schedule> = {}): Schedule => ({
  frequency: 'monthly',
  interval: 1,
  weekdays: [],
  dayOfMonth: 1,
  startDate: '2026-01-01',
  ...overrides,
});

const template: RecurringTemplate = {
  type: 'income',
  amount: 300000,
  accountId: 'bank',
  toAccountId: null,
  categoryId: 'inc_salary',
  payee: 'Acme',
  note: null,
  tags: ['work'],
};

const rule = (overrides: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'r1',
  ...schedule(),
  template,
  endType: 'never',
  endDate: null,
  maxCount: null,
  occurrences: 0,
  nextDueDate: '2026-01-01',
  mode: 'auto',
  active: true,
  createdAt: null,
  updatedAt: null,
  ...overrides,
});

/** The first `count` schedule dates from the start. */
function dates(s: Schedule, count: number): string[] {
  const result = [firstDueDate(s)];
  while (result.length < count) result.push(nextAfter(s, result[result.length - 1]));
  return result;
}

describe('occurrenceId (§8 IDs, REC-05)', () => {
  it('is the rule ID and the compact date', () => {
    expect(occurrenceId('abc', '2026-10-01')).toBe('abc_20261001');
  });
});

describe('firstOnOrAfter (REC-02)', () => {
  it('repeats daily every N days from the start date', () => {
    expect(dates(schedule({ frequency: 'daily', startDate: '2026-09-29' }), 3)).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
    ]);
    const everyThird = schedule({ frequency: 'daily', interval: 3, startDate: '2026-09-01' });
    expect(firstOnOrAfter(everyThird, '2026-09-05')).toBe('2026-09-07');
    expect(firstOnOrAfter(everyThird, '2026-09-07')).toBe('2026-09-07');
  });

  it('repeats weekly on the chosen weekdays, every N Monday-to-Sunday weeks', () => {
    // Wednesday 2 Sep 2026; Mondays and Thursdays every other week.
    const s = schedule({
      frequency: 'weekly',
      interval: 2,
      weekdays: [4, 1],
      dayOfMonth: null,
      startDate: '2026-09-02',
    });
    expect(dates(s, 5)).toEqual([
      '2026-09-03', // Thu of the start week (its Monday was before the start)
      '2026-09-14',
      '2026-09-17',
      '2026-09-28',
      '2026-10-01',
    ]);
    expect(firstOnOrAfter(s, '2026-09-08')).toBe('2026-09-14');
  });

  it("repeats weekly on the start date's weekday when none are chosen", () => {
    const s = schedule({ frequency: 'weekly', weekdays: [], startDate: '2026-09-27' });
    expect(weekdaysOf(s)).toEqual([7]);
    expect(dates(s, 2)).toEqual(['2026-09-27', '2026-10-04']);
  });

  it('puts a monthly day 29–31 on the last day of shorter months (BR-09)', () => {
    const s = schedule({ dayOfMonth: 31, startDate: '2027-01-01' });
    expect(dates(s, 4)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
    const leap = schedule({ dayOfMonth: 30, startDate: '2028-02-01' });
    expect(firstDueDate(leap)).toBe('2028-02-29');
  });

  it('starts a monthly rule the next month when its day has passed', () => {
    expect(firstDueDate(schedule({ dayOfMonth: 1, startDate: '2026-09-15' }))).toBe('2026-10-01');
    expect(firstDueDate(schedule({ dayOfMonth: 20, startDate: '2026-09-15' }))).toBe('2026-09-20');
  });

  it('counts monthly intervals from the start month', () => {
    const quarterly = schedule({ interval: 3, dayOfMonth: 5, startDate: '2026-11-01' });
    expect(dates(quarterly, 3)).toEqual(['2026-11-05', '2027-02-05', '2027-05-05']);
    expect(firstOnOrAfter(quarterly, '2026-12-01')).toBe('2027-02-05');
  });

  it("uses the start date's day when a monthly rule has none", () => {
    const s = schedule({ dayOfMonth: null, startDate: '2026-09-27' });
    expect(dayOfMonthOf(s)).toBe(27);
    expect(nextAfter(s, '2026-09-27')).toBe('2026-10-27');
  });

  it('repeats yearly on the start date, 29 February on the 28th in common years', () => {
    const s = schedule({ frequency: 'yearly', startDate: '2028-02-29' });
    expect(dates(s, 3)).toEqual(['2028-02-29', '2029-02-28', '2030-02-28']);
    const everyOther = schedule({ frequency: 'yearly', interval: 2, startDate: '2026-12-25' });
    expect(firstOnOrAfter(everyOther, '2027-01-01')).toBe('2028-12-25');
  });

  it('never returns a date before the start', () => {
    const s = schedule({ frequency: 'daily', startDate: '2026-10-10' });
    expect(firstOnOrAfter(s, '2026-01-01')).toBe('2026-10-10');
  });
});

describe('pendingDates and isEnded (REC-03)', () => {
  it('stops after N occurrences, counting those already created', () => {
    const r = rule({ endType: 'count', maxCount: 3, occurrences: 1, nextDueDate: '2026-02-01' });
    expect(pendingDates(r, 10)).toEqual(['2026-02-01', '2026-03-01']);
    expect(isEnded(r)).toBe(false);
    expect(isEnded({ ...r, occurrences: 3 })).toBe(true);
  });

  it('stops after the end date', () => {
    const r = rule({ endType: 'until', endDate: '2026-03-15' });
    expect(pendingDates(r, 10)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
    expect(isEnded({ ...r, nextDueDate: '2026-04-01' })).toBe(true);
  });

  it('never ends a rule without an end', () => {
    expect(pendingDates(rule(), 3)).toHaveLength(3);
    expect(isEnded(rule({ nextDueDate: '2099-01-01' }))).toBe(false);
  });
});

describe('dueDates (REC-06)', () => {
  it('catches up every occurrence missed up to today, oldest first', () => {
    const r = rule({ nextDueDate: '2026-07-01' });
    expect(dueDates(r, '2026-09-27')).toEqual(['2026-07-01', '2026-08-01', '2026-09-01']);
    expect(dueDates(r, '2026-09-27', 2)).toEqual(['2026-07-01', '2026-08-01']);
  });

  it('is due on the date itself, not before (US-08)', () => {
    const r = rule({ nextDueDate: '2026-10-01' });
    expect(dueDates(r, '2026-09-30')).toEqual([]);
    expect(dueDates(r, '2026-10-01')).toEqual(['2026-10-01']);
  });

  it('has nothing due while paused', () => {
    expect(dueDates(rule({ active: false }), '2026-09-27')).toEqual([]);
  });
});

describe('upcomingDates (DSH-08)', () => {
  it('lists what is due and what comes in the next days, oldest first', () => {
    const daily = rule({ frequency: 'daily', nextDueDate: '2026-09-26' });
    expect(upcomingDates(daily, '2026-09-27', 2)).toEqual([
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
    ]);
  });

  it('has nothing beyond the window, while paused, or once ended', () => {
    expect(upcomingDates(rule({ nextDueDate: '2026-10-05' }), '2026-09-27', 7)).toEqual([]);
    expect(upcomingDates(rule({ nextDueDate: '2026-10-04' }), '2026-09-27', 7)).toEqual([
      '2026-10-04',
    ]);
    expect(
      upcomingDates(rule({ nextDueDate: '2026-10-01', active: false }), '2026-09-27', 7),
    ).toEqual([]);
    expect(
      upcomingDates(
        rule({ nextDueDate: '2026-10-01', endType: 'until', endDate: '2026-09-30' }),
        '2026-09-27',
        7,
      ),
    ).toEqual([]);
  });
});

describe('rescheduling (REC-07)', () => {
  const weekly = schedule({ frequency: 'weekly', weekdays: [5], startDate: '2026-01-01' });

  it('counts an edited schedule from today', () => {
    // Next was 1 Oct under the old monthly schedule; Fridays from Sunday 27 Sep.
    expect(rescheduledDueDate(weekly, '2026-10-01', '2026-09-27')).toBe('2026-10-02');
  });

  it('keeps an earlier date still waiting to be confirmed', () => {
    expect(rescheduledDueDate(weekly, '2026-09-01', '2026-09-27')).toBe('2026-09-04');
  });

  it('leaves out dates that passed while paused, and keeps a future next date', () => {
    const monthly = schedule({ dayOfMonth: 1 });
    expect(resumedDueDate(monthly, '2026-07-01', '2026-09-27')).toBe('2026-10-01');
    expect(resumedDueDate(monthly, '2026-11-01', '2026-09-27')).toBe('2026-11-01');
  });
});

describe('occurrenceOf', () => {
  it('writes the template on the date, linked to the rule, without a time', () => {
    expect(occurrenceOf('r1', template, '2026-10-01', 'USD')).toEqual({
      type: 'income',
      amount: 300000,
      currency: 'USD',
      accountId: 'bank',
      toAccountId: null,
      categoryId: 'inc_salary',
      date: '2026-10-01',
      time: null,
      payee: 'Acme',
      note: null,
      tags: ['work'],
      recurringRuleId: 'r1',
    });
  });

  it('drops the category of a transfer and the destination of anything else', () => {
    const transfer = { ...template, type: 'transfer' as const, toAccountId: 'cash' };
    expect(occurrenceOf('r1', transfer, '2026-10-01', 'USD')).toMatchObject({
      toAccountId: 'cash',
      categoryId: null,
    });
    expect(
      occurrenceOf('r1', { ...template, toAccountId: 'cash' }, '2026-10-01', 'USD'),
    ).toMatchObject({ toAccountId: null });
  });
});

describe('Make recurring (REC-01)', () => {
  it('takes the template from a transaction', () => {
    expect(
      templateOf({
        type: 'expense',
        amount: 1200,
        accountId: 'cash',
        toAccountId: 'bank',
        categoryId: 'exp_food',
        payee: null,
        note: 'Lunch',
        tags: [],
      }),
    ).toEqual({
      type: 'expense',
      amount: 1200,
      accountId: 'cash',
      toAccountId: null,
      categoryId: 'exp_food',
      payee: null,
      note: 'Lunch',
      tags: [],
    });
  });

  it('starts one period after the transaction, on the same day', () => {
    expect(scheduleAfter('2026-09-15', 'monthly')).toEqual({
      frequency: 'monthly',
      interval: 1,
      weekdays: [],
      dayOfMonth: 15,
      startDate: '2026-10-15',
    });
    expect(scheduleAfter('2026-09-27', 'weekly')).toMatchObject({
      weekdays: [7],
      dayOfMonth: null,
      startDate: '2026-10-04',
    });
    expect(scheduleAfter('2026-01-31', 'monthly')).toMatchObject({
      dayOfMonth: 31,
      startDate: '2026-02-28',
    });
    expect(firstDueDate(scheduleAfter('2026-01-31', 'monthly'))).toBe('2026-02-28');
    expect(scheduleAfter('2026-09-27', 'daily').startDate).toBe('2026-09-28');
    expect(scheduleAfter('2028-02-29', 'yearly').startDate).toBe('2029-02-28');
  });
});
