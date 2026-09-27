import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { BudgetsRepo } from '../../core/data/budgets.repo';
import { TransactionsRepo } from '../../core/data/transactions.repo';
import { BudgetInput } from '../../core/models/budget';
import { Preferences } from '../../core/preferences';
import { NotificationService } from '../../shared/components/ui/notification';
import { AccountsStore } from '../accounts/accounts.store';
import { CategoriesStore } from '../categories/categories.store';
import { BudgetAlerts } from './budget-alerts';
import { BudgetsStore } from './budgets.store';

const input = (overrides: Partial<BudgetInput> = {}): BudgetInput => ({
  name: 'Food',
  amount: 50000,
  period: 'monthly',
  categoryIds: ['exp_food'],
  rollover: false,
  alerts: true,
  ...overrides,
});

describe('BudgetAlerts (BUD-06)', () => {
  const notify = { warn: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() };
  let cash: string;
  let store: BudgetsStore;

  const spend = (amount: number, date = '2026-09-26') => {
    TestBed.inject(TransactionsRepo).add({
      type: 'expense',
      amount,
      currency: 'USD',
      accountId: cash,
      categoryId: 'exp_food',
      date,
      tags: [],
    });
    TestBed.tick();
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 26, 10));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Preferences,
          useValue: {
            locale: signal('en-US'),
            baseCurrency: signal('USD'),
            monthStartDay: signal(1),
            weekStartDay: signal(1),
          },
        },
        { provide: NotificationService, useValue: notify },
      ],
    });
    TestBed.inject(CategoriesStore).seedDefaults();
    cash = TestBed.inject(AccountsStore).create({
      name: 'Cash',
      type: 'cash',
      openingBalance: 0,
      creditLimit: null,
      includeInTotal: true,
    });
    store = TestBed.inject(BudgetsStore);
    TestBed.inject(BudgetAlerts);
    TestBed.tick();
  });

  afterEach(() => vi.useRealTimers());

  it('sends one 80% alert, then one at 100% (US-04)', () => {
    const id = store.create(input());
    spend(38000, '2026-09-10');
    expect(notify.warn).not.toHaveBeenCalled();

    spend(5000);
    expect(notify.warn).toHaveBeenCalledTimes(1);
    expect(notify.warn).toHaveBeenCalledWith(
      'Food: 86% used',
      '$70.00 left · 5 days left',
      expect.objectContaining({ action: expect.objectContaining({ label: 'View' }) }),
    );
    expect(store.byId(id)!.lastAlert).toEqual({ periodStart: '2026-09-01', threshold: 80 });

    spend(1000);
    expect(notify.warn).toHaveBeenCalledTimes(1);

    spend(10000);
    expect(notify.error).toHaveBeenCalledTimes(1);
    expect(notify.error).toHaveBeenCalledWith(
      'Food: over budget',
      '$40.00 over · 5 days left',
      expect.anything(),
    );
    expect(store.byId(id)!.lastAlert).toEqual({ periodStart: '2026-09-01', threshold: 100 });

    spend(1000);
    expect(notify.error).toHaveBeenCalledTimes(1);
  });

  it('sends only the 100% alert when one expense passes both', () => {
    store.create(input());
    spend(60000);
    expect(notify.warn).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledTimes(1);
  });

  it('never repeats an alert another device already sent this period', () => {
    const id = store.create(input());
    TestBed.inject(BudgetsRepo).recordAlert(id, { periodStart: '2026-09-01', threshold: 80 });
    spend(45000);
    expect(notify.warn).not.toHaveBeenCalled();
  });

  it('alerts again in a new period', () => {
    const id = store.create(input());
    TestBed.inject(BudgetsRepo).recordAlert(id, { periodStart: '2026-08-01', threshold: 100 });
    spend(45000);
    expect(notify.warn).toHaveBeenCalledTimes(1);
  });

  it('stays quiet for paused budgets and budgets with alerts off', () => {
    const paused = store.create(input());
    store.setActive(store.byId(paused)!, false);
    store.create(input({ name: 'Quiet', alerts: false }));
    spend(60000);
    expect(notify.warn).not.toHaveBeenCalled();
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('opens the budget from the alert', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const id = store.create(input());
    spend(45000);

    notify.warn.mock.calls[0][2].action.handler();
    expect(navigate).toHaveBeenCalledWith(['/budgets', id]);
  });
});
