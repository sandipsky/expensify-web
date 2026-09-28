import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RecurringRuleInput } from '../../core/models/recurring';
import { Preferences } from '../../core/preferences';
import { AccountsStore } from '../accounts/accounts.store';
import { CategoriesStore } from '../categories/categories.store';
import { RecurringStore } from '../recurring/recurring.store';
import { BillReminders, reminderText } from './bill-reminders';
import { Notifier } from './notifier';

describe('BillReminders (NTF-03)', () => {
  const deliver = vi.fn();
  let bank: string;

  const rule = (dayOfMonth: number, mode: 'auto' | 'confirm' = 'confirm'): RecurringRuleInput => ({
    template: {
      type: 'expense',
      amount: 2_000_000,
      accountId: bank,
      toAccountId: null,
      categoryId: 'exp_housing',
      payee: 'Landlord',
      note: null,
      tags: [],
    },
    frequency: 'monthly',
    interval: 1,
    weekdays: [],
    dayOfMonth,
    startDate: `2026-09-${String(dayOfMonth).padStart(2, '0')}`,
    endType: 'never',
    endDate: null,
    maxCount: null,
    mode,
  });

  const start = () => {
    TestBed.inject(BillReminders);
    TestBed.tick();
  };

  beforeEach(() => {
    localStorage.clear();
    deliver.mockClear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 28, 9));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Notifier, useValue: { deliver } }],
    });
    TestBed.inject(Preferences).save({ baseCurrency: 'USD', locale: 'en-US' });
    TestBed.inject(CategoriesStore).seedDefaults();
    bank = TestBed.inject(AccountsStore).create({
      name: 'Bank',
      type: 'bank',
      openingBalance: 0,
      creditLimit: null,
      includeInTotal: true,
    });
  });

  afterEach(() => vi.useRealTimers());

  it('reminds the day before an ask-first entry is due, once', () => {
    TestBed.inject(RecurringStore).create(rule(29));
    start();
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'bill',
        title: 'Landlord is due tomorrow',
        message: '-$20,000.00 · Bank. You’ll be asked to confirm it.',
        link: '/recurring',
      }),
    );

    // Anything that reruns the check doesn't repeat it, in this session or the next.
    TestBed.inject(RecurringStore).create(rule(15, 'auto'));
    TestBed.tick();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Notifier, useValue: { deliver } }],
    });
    start();
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('reminds on the due date', () => {
    TestBed.inject(RecurringStore).create(rule(28));
    start();
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Landlord is due today' }),
    );
  });

  it('leaves out automatic rules, and everything while switched off (NTF-04)', () => {
    TestBed.inject(RecurringStore).create(rule(29, 'auto'));
    TestBed.inject(Preferences).save({ notificationPrefs: { billReminders: false } });
    TestBed.inject(RecurringStore).create(rule(28));
    start();
    expect(deliver).not.toHaveBeenCalled();

    TestBed.inject(Preferences).save({ notificationPrefs: { billReminders: true } });
    TestBed.tick();
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Landlord is due today' }),
    );
  });

  it('words catch-ups and older waiting entries', () => {
    const base = { ruleId: 'r', kind: 'due' as const };
    expect(
      reminderText(
        'Rent',
        '−$20',
        'Bank',
        { ...base, date: '2026-09-01', count: 2 },
        '2026-09-28',
        'en-US',
      ),
    ).toEqual({
      title: 'Rent: 2 entries waiting',
      message: '−$20 each · Bank. Confirm or skip them.',
    });
    expect(
      reminderText(
        'Rent',
        '−$20',
        'Bank',
        { ...base, date: '2026-09-01', count: 1 },
        '2026-09-28',
        'en-US',
      ),
    ).toEqual({ title: 'Rent is waiting', message: 'Due Sep 1 · −$20. Confirm or skip it.' });
  });
});
