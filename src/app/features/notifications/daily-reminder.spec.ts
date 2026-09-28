import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TransactionsRepo } from '../../core/data/transactions.repo';
import { NewTransaction } from '../../core/models/transaction';
import { Preferences } from '../../core/preferences';
import { AccountsStore } from '../accounts/accounts.store';
import { DailyReminder } from './daily-reminder';
import { Notifier } from './notifier';

describe('DailyReminder (NTF-01)', () => {
  const deliver = vi.fn();
  let cash: string;

  const entry = (overrides: Partial<NewTransaction> = {}): NewTransaction => ({
    type: 'expense',
    amount: 500,
    currency: 'NPR',
    accountId: cash,
    categoryId: 'exp_food',
    date: '2026-09-28',
    tags: [],
    ...overrides,
  });

  const start = async (time: Date, prefs = { dailyReminder: true, reminderTime: '20:00' }) => {
    vi.setSystemTime(time);
    TestBed.inject(Preferences).save({ notificationPrefs: prefs });
    TestBed.inject(DailyReminder);
    await settle();
  };

  const settle = async () => {
    TestBed.tick();
    await Promise.resolve();
    TestBed.tick();
  };

  /** The app comes back into view, as after a laptop wakes up. */
  const wake = async (time: Date) => {
    vi.setSystemTime(time);
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
  };

  beforeEach(() => {
    localStorage.clear();
    deliver.mockClear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 28, 9));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Notifier, useValue: { deliver } }],
    });
    cash = TestBed.inject(AccountsStore).create({
      name: 'Cash',
      type: 'cash',
      openingBalance: 0,
      creditLimit: null,
      includeInTotal: true,
    });
  });

  afterEach(() => vi.useRealTimers());

  it('reminds once the time has come if nothing is logged today, once a day', async () => {
    await start(new Date(2026, 8, 28, 19, 0));
    expect(deliver).not.toHaveBeenCalled();

    await wake(new Date(2026, 8, 28, 20, 1));
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'reminder|2026-09-28',
        kind: 'reminder',
        link: '/transactions/new',
        actionLabel: 'Add',
      }),
    );

    await wake(new Date(2026, 8, 28, 21, 0));
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('reminds when the app opens after the time, too', async () => {
    await start(new Date(2026, 8, 28, 22, 0));
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('stays quiet once something is logged for today; recurring entries don’t count', async () => {
    TestBed.inject(TransactionsRepo).addMany([entry()], 'recurring');
    await start(new Date(2026, 8, 28, 21, 0), { dailyReminder: false, reminderTime: '20:00' });
    TestBed.inject(TransactionsRepo).add(entry());
    TestBed.inject(Preferences).save({ notificationPrefs: { dailyReminder: true } });
    await settle();
    expect(deliver).not.toHaveBeenCalled();
  });

  it('reminds after a recurring entry alone', async () => {
    TestBed.inject(TransactionsRepo).addMany([entry()], 'recurring');
    await start(new Date(2026, 8, 28, 21, 0));
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('never reminds while switched off', async () => {
    await start(new Date(2026, 8, 28, 21, 0), { dailyReminder: false, reminderTime: '20:00' });
    await wake(new Date(2026, 8, 28, 23, 0));
    expect(deliver).not.toHaveBeenCalled();
  });
});
