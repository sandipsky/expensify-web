import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { LocalDb } from '../../core/data/local-db';
import { TransactionsRepo } from '../../core/data/transactions.repo';
import { RecurringRuleInput } from '../../core/models/recurring';
import { Preferences } from '../../core/preferences';
import { Today } from '../../core/today';
import { AccountsStore } from '../accounts/accounts.store';
import { CategoriesStore } from '../categories/categories.store';
import { RecurringRunner } from './recurring-runner';
import { RecurringStore } from './recurring.store';

describe('RecurringStore', () => {
  let bank: string;

  const input = (overrides: Partial<RecurringRuleInput> = {}): RecurringRuleInput => ({
    template: {
      type: 'income',
      amount: 300000,
      accountId: bank,
      toAccountId: null,
      categoryId: 'inc_salary',
      payee: 'Acme',
      note: null,
      tags: [],
    },
    frequency: 'monthly',
    interval: 1,
    weekdays: [],
    dayOfMonth: 1,
    startDate: '2026-10-01',
    endType: 'never',
    endDate: null,
    maxCount: null,
    mode: 'auto',
    ...overrides,
  });

  /** The store with its listeners running. */
  function recurring() {
    const store = TestBed.inject(RecurringStore);
    TestBed.tick();
    return store;
  }

  const at = (month: number, day: number) => vi.setSystemTime(new Date(2026, month - 1, day, 10));
  const entries = () =>
    firstValueFrom(
      TestBed.inject(TransactionsRepo).watchRange({ start: '2000-01-01', end: '2099-12-31' }),
    );

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    at(9, 27);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Preferences,
          useValue: {
            locale: signal('en-US'),
            baseCurrency: signal('USD'),
            monthStartDay: signal(1),
            weekStartDay: signal(1),
          },
        },
      ],
    });
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

  it('adds a rule due on its first schedule date, and describes it', () => {
    const store = recurring();
    const id = store.create(input({ startDate: '2026-09-15' }));
    TestBed.tick();
    const view = store.byId(id)!;
    expect(view.rule).toMatchObject({ nextDueDate: '2026-10-01', occurrences: 0, active: true });
    expect(view).toMatchObject({
      name: 'Acme',
      schedule: 'Every month on the 1st',
      accountLabel: 'Bank',
      kind: 'income',
      amount: 300000,
      status: 'active',
      next: '2026-10-01',
      due: [],
    });
  });

  it('clears the fields other frequencies and ends don’t use', () => {
    const store = recurring();
    const id = store.create(
      input({ frequency: 'weekly', weekdays: [4, 1], dayOfMonth: 1, endDate: '2027-01-01' }),
    );
    TestBed.tick();
    expect(store.byId(id)!.rule).toMatchObject({
      weekdays: [1, 4],
      dayOfMonth: null,
      endDate: null,
    });
  });

  it('moves the next date when the schedule changes, but not for other edits (REC-07)', () => {
    const store = recurring();
    const id = store.create(input({ startDate: '2026-09-02' }));
    TestBed.tick();
    const amount = { ...input().template, amount: 1 };
    store.update(store.byId(id)!.rule, input({ startDate: '2026-09-02', template: amount }));
    TestBed.tick();
    expect(store.byId(id)!.rule).toMatchObject({
      nextDueDate: '2026-10-01',
      template: { amount: 1 },
    });

    store.update(store.byId(id)!.rule, input({ startDate: '2026-09-02', dayOfMonth: 28 }));
    TestBed.tick();
    expect(store.byId(id)!.rule.nextDueDate).toBe('2026-09-28');
  });

  it('leaves out the dates that passed while paused when it resumes (REC-07)', () => {
    const store = recurring();
    const id = store.create(input({ mode: 'confirm' }));
    TestBed.tick();
    store.setActive(store.byId(id)!.rule, false);
    TestBed.tick();
    expect(store.byId(id)!.status).toBe('paused');

    at(12, 5);
    TestBed.inject(Today).date.set('2026-12-05');
    store.setActive(store.byId(id)!.rule, true);
    TestBed.tick();
    expect(store.byId(id)!.rule).toMatchObject({ active: true, nextDueDate: '2027-01-01' });
  });

  it('lists ask-first entries waiting to be confirmed, oldest first (REC-04, REC-06)', () => {
    const store = recurring();
    const rent = store.create(
      input({
        mode: 'confirm',
        startDate: '2026-08-05',
        dayOfMonth: 5,
        template: {
          ...input().template,
          type: 'expense',
          categoryId: 'exp_housing',
          payee: 'Rent',
        },
      }),
    );
    store.create(input({ mode: 'confirm', startDate: '2026-09-01' }));
    TestBed.tick();
    expect(store.waiting().map((v) => [v.name, v.due])).toEqual([
      ['Rent', ['2026-08-05', '2026-09-05']],
      ['Acme', ['2026-09-01']],
    ]);
    expect(store.waitingCount()).toBe(3);
    expect(store.byId(rent)!.amount).toBe(-300000);
  });

  it('flags a rule whose account was deleted', async () => {
    const store = recurring();
    const id = store.create(input({ template: { ...input().template, accountId: 'gone' } }));
    TestBed.tick();
    expect(store.byId(id)).toMatchObject({
      status: 'missing_account',
      accountLabel: 'Deleted account',
      due: [],
    });
  });

  it('shows a rule as ended once it has run its course (REC-03)', () => {
    const store = recurring();
    const id = store.create(input({ endType: 'until', endDate: '2026-09-30' }));
    TestBed.tick();
    expect(store.byId(id)).toMatchObject({ status: 'ended', next: null });
    expect(store.ended().map((v) => v.id)).toEqual([id]);
  });

  describe('with the runner (REC-05, REC-06, US-08)', () => {
    it('creates the missed and due entries of automatic rules once, and leaves ask-first ones', async () => {
      const store = recurring();
      store.create(input({ startDate: '2026-07-01' }));
      store.create(
        input({
          mode: 'confirm',
          startDate: '2026-07-01',
          template: { ...input().template, payee: 'Ask' },
        }),
      );
      TestBed.inject(RecurringRunner);
      TestBed.tick();
      await vi.waitFor(async () => expect(await entries()).toHaveLength(3));
      TestBed.tick();

      const txs = await entries();
      expect(txs.map((t) => t.date)).toEqual(['2026-09-01', '2026-08-01', '2026-07-01']);
      expect(txs.every((t) => t.payee === 'Acme' && t.source === 'recurring')).toBe(true);
      expect(TestBed.inject(AccountsStore).byId(bank)!.currentBalance).toBe(900000);
      expect(store.waitingCount()).toBe(3);
    });

    it('creates the next entry when the day comes', async () => {
      const store = recurring();
      store.create(input());
      TestBed.inject(RecurringRunner);
      TestBed.tick();
      expect(await entries()).toHaveLength(0);

      at(10, 1);
      TestBed.inject(Today).date.set('2026-10-01');
      TestBed.tick();
      await vi.waitFor(async () => expect(await entries()).toHaveLength(1));
      TestBed.tick();
      expect(store.views()[0].next).toBe('2026-11-01');
    });
  });
});
