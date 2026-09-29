import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { TransactionsRepo } from '../../../core/data/transactions.repo';
import { RecurringRuleInput } from '../../../core/models/recurring';
import { NewTransaction } from '../../../core/models/transaction';
import { Preferences } from '../../../core/preferences';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { NotificationService } from '../../../shared/components/ui/notification';
import { AccountsStore } from '../../accounts/accounts.store';
import { BudgetsStore } from '../../budgets/budgets.store';
import { CategoriesStore } from '../../categories/categories.store';
import { readState } from '../../notifications/device-state';
import { RecurringActions } from '../../recurring/recurring-actions';
import { RecurringStore } from '../../recurring/recurring.store';
import { TransactionActions } from '../../transactions/transaction-actions';
import { DASHBOARD_LAYOUT_KEY, DashboardLayout } from '../dashboard-layout';
import { DashboardPage } from './dashboard-page';

/** Text as a reader meets it: each text node trimmed, joined by single spaces. */
function textOf(node: Element): string {
  const parts: string[] = [];
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent!.trim();
    if (text) parts.push(text);
  }
  return parts.join(' ');
}

@Component({ template: '' })
class Blank {}

describe('DashboardPage', () => {
  const originalMatchMedia = window.matchMedia;
  const monthStartDay = signal(1);
  const notify = { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  let bank: string;
  let cash: string;

  const add = (overrides: Partial<NewTransaction>) =>
    TestBed.inject(TransactionsRepo).add({
      type: 'expense',
      amount: 1000,
      currency: 'USD',
      accountId: cash,
      categoryId: 'exp_food',
      date: '2026-09-10',
      tags: [],
      ...overrides,
    });

  const rule = (overrides: Partial<RecurringRuleInput> = {}): RecurringRuleInput => ({
    template: {
      type: 'expense',
      amount: 80000,
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
    dayOfMonth: 1,
    startDate: '2026-10-01',
    endType: 'never',
    endDate: null,
    maxCount: null,
    mode: 'auto',
    ...overrides,
  });

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    monthStartDay.set(1);
    // Desktop layout; jsdom has no `matchMedia`.
    window.matchMedia = ((query: string) => ({
      matches: query.includes('min-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 27, 10));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'dashboard', component: DashboardPage },
          { path: 'transactions', component: Blank },
        ]),
        {
          provide: Preferences,
          useValue: {
            locale: signal('en-US'),
            baseCurrency: signal('USD'),
            monthStartDay,
            weekStartDay: signal(1),
          },
        },
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
        { provide: NotificationService, useValue: notify },
      ],
    });
    TestBed.inject(CategoriesStore).seedDefaults();
    const accounts = TestBed.inject(AccountsStore);
    const account = (name: string, openingBalance: number, includeInTotal = true) =>
      accounts.create({
        name,
        type: name === 'Bank' ? 'bank' : name === 'Savings' ? 'savings' : 'cash',
        openingBalance,
        creditLimit: null,
        includeInTotal,
      });
    bank = account('Bank', 0);
    cash = account('Cash', 1000000);
    account('Savings', 100000, false);
    const old = account('Old wallet', 50000);
    accounts.setArchived(accounts.byId(old)!, true);

    // September: salary, seven expense categories, a transfer and an adjustment.
    add({
      type: 'income',
      amount: 300000,
      accountId: bank,
      categoryId: 'inc_salary',
      date: '2026-09-01',
      payee: 'Acme',
    });
    add({
      type: 'transfer',
      amount: 50000,
      accountId: bank,
      toAccountId: cash,
      categoryId: null,
      date: '2026-09-03',
    });
    add({ amount: 80000, categoryId: 'exp_housing', payee: 'Landlord', date: '2026-09-05' });
    add({ amount: 2000, categoryId: 'exp_groceries', date: '2026-09-08' });
    add({ amount: 1000, categoryId: 'exp_health', date: '2026-09-09' });
    add({ amount: 500, categoryId: 'exp_entertainment', date: '2026-09-10' });
    add({ amount: 400, categoryId: 'exp_shopping', date: '2026-09-11' });
    add({ amount: 6000, categoryId: 'exp_food', payee: 'Cafe', date: '2026-09-12' });
    add({ amount: 99999, categoryId: 'exp_adjustment', date: '2026-09-15' });
    add({ amount: 3000, categoryId: 'exp_transport', date: '2026-09-20' });
    // August and July, for the change and the trend.
    add({ amount: 4000, categoryId: 'exp_food', date: '2026-08-10' });
    add({
      type: 'income',
      amount: 300000,
      accountId: bank,
      categoryId: 'inc_salary',
      date: '2026-08-01',
    });
    add({ amount: 1000, categoryId: 'exp_food', date: '2026-07-10' });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.useRealTimers();
  });

  async function open(url = '/dashboard') {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    TestBed.tick();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    const el = harness.routeNativeElement as HTMLElement;
    const router = TestBed.inject(Router);
    const settle = async () => {
      TestBed.tick();
      harness.fixture.detectChanges();
      await harness.fixture.whenStable();
    };
    return { harness, el, router, settle };
  }

  it('shows income, expense, net and savings rate with the change from the previous period (DSH-01, DSH-10, BR-04)', async () => {
    const { el } = await open();
    expect(textOf(el.querySelector('app-summary-cards')!)).toBe(
      'Income +$3,000.00 $0.00 (0%) from the previous period ' +
        'Expense -$929.00 +$889.00 (+2,223%) from the previous period ' +
        'Net +$2,071.00 -$889.00 (-30%) from the previous period ' +
        'Savings rate 69% -30 pts from the previous period',
    );
    expect(textOf(el.querySelector('.dash__period-label')!)).toBe('September 2026');
  });

  it('opens the transaction list on the period and type from a summary card (DSH-11)', async () => {
    const { el, router } = await open();
    el.querySelectorAll<HTMLButtonElement>('app-summary-cards .tile')[1].click();
    await vi.waitFor(() => expect(router.url).toContain('/transactions'));
    expect(router.url).toBe('/transactions?from=2026-09-01&to=2026-09-30&type=expense');
  });

  it('totals the accounts marked "include in total" and lists the active ones (DSH-02, DSH-12)', async () => {
    const { el } = await open();
    const card = el.querySelector('app-balances-card')!;
    expect(textOf(card.querySelector('.balances__total')!)).toBe(
      'Total balance $14,021.01 Across 2 accounts · 1 not included',
    );
    expect([...card.querySelectorAll('.balances__row')].map(textOf)).toEqual([
      'Bank Bank $5,500.00',
      'Cash Cash $8,521.01',
      'Savings Savings $1,000.00',
    ]);
    expect(card.querySelector('a.balances__total')!.getAttribute('href')).toBe('/accounts');
  });

  it('charts the top five categories and "Other", and a row opens those entries (DSH-03, DSH-12)', async () => {
    const { el, router } = await open();
    const rows = [...el.querySelectorAll('app-spending-card app-report-row')];
    expect(rows.map(textOf)).toEqual([
      'Housing and rent 1 entry $800.00 86%',
      'Food and dining 1 entry $60.00 6%',
      'Transport 1 entry $30.00 3%',
      'Groceries 1 entry $20.00 2%',
      'Health 1 entry $10.00 1%',
      'Other 2 categories · 2 entries $9.00 1%',
    ]);
    expect(textOf(el.querySelector('.l-donut-chart__center')!)).toBe('$929.00 7 entries');
    expect(el.querySelectorAll('l-donut-chart path.l-donut-chart__arc')).toHaveLength(6);

    rows[5].querySelector('button')!.click();
    await vi.waitFor(() => expect(router.url).toContain('/transactions'));
    expect(router.url).toBe(
      '/transactions?from=2026-09-01&to=2026-09-30&type=expense&category=exp_entertainment,exp_shopping',
    );
  });

  it('charts the last six periods, and a bar selects that period in the switcher (DSH-04, DSH-06, DSH-11)', async () => {
    const { el, router, settle } = await open();
    const groups = () =>
      el.querySelectorAll<HTMLButtonElement>('app-trend-card .l-bar-chart__group');
    expect(groups()).toHaveLength(6);
    expect([...groups()].map((g) => g.getAttribute('aria-current'))).toEqual([
      null,
      null,
      null,
      null,
      null,
      'true',
    ]);

    groups()[4].click();
    await vi.waitFor(() => expect(router.url).toBe('/dashboard?period=last_month'));
    await settle();
    expect(textOf(el.querySelector('.dash__period-label')!)).toBe('August 2026');
    expect(textOf(el.querySelector('app-summary-cards')!)).toContain('Expense -$40.00');

    groups()[0].click();
    await vi.waitFor(() =>
      expect(router.url).toBe('/dashboard?period=custom&from=2026-03-01&to=2026-03-31'),
    );
    await settle();
    expect(textOf(el.querySelector('.dash__period-label')!)).toBe('March 2026');
    expect(el.querySelectorAll('l-date-input')).toHaveLength(2);
  });

  it('shows the date range instead of a month name when months start on another day (BR-05)', async () => {
    monthStartDay.set(25);
    const { el } = await open('/dashboard?period=last_month');
    // Intl sets the range with thin spaces around the dash.
    expect(textOf(el.querySelector('.dash__period-label')!).replace(/\s+/g, ' ')).toBe(
      'Aug 25 – Sep 24, 2026',
    );
  });

  it('lists the five newest entries with their dates, and a row opens its form (DSH-05)', async () => {
    const edit = vi
      .spyOn(TestBed.inject(TransactionActions), 'edit')
      .mockReturnValue(of(undefined));
    const { el } = await open();
    const rows = [...el.querySelectorAll('app-recent-card app-transaction-row')];
    expect(rows.map((r) => textOf(r.querySelector('.tx-row__title')!))).toEqual([
      'Transport',
      'Balance adjustment',
      'Cafe',
      'Shopping',
      'Entertainment',
    ]);
    expect(textOf(rows[2].querySelector('.tx-row__subtitle')!)).toBe(
      'Sat, Sep 12, 2026 · Food and dining · Cash',
    );

    rows[0].querySelector('button')!.click();
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ amount: 3000 }));
  });

  it('shows active budgets most used first with state and safe-to-spend (DSH-07, BR-08)', async () => {
    const budgets = TestBed.inject(BudgetsStore);
    const input = { period: 'monthly' as const, rollover: false, alerts: false };
    budgets.create({ ...input, name: 'Food', amount: 10000, categoryIds: ['exp_food'] });
    budgets.create({ ...input, name: 'Housing', amount: 50000, categoryIds: ['exp_housing'] });
    budgets.create({ ...input, name: 'Everything', amount: 200000, categoryIds: [] });
    const { el } = await open();
    const rows = [...el.querySelectorAll('app-budgets-card .budgets__row')].map(textOf);
    expect(rows).toEqual([
      'Housing $800.00 of $500.00 Over 160% Nothing left to spend',
      'Food $60.00 of $100.00 On track 60% $10.00 a day to spend',
      'Everything $929.00 of $2,000.00 On track 46% $267.75 a day to spend',
    ]);
  });

  it('lists recurring entries due in the next seven days, with Confirm and Skip for ask-first ones (DSH-08, REC-04)', async () => {
    const rules = TestBed.inject(RecurringStore);
    rules.create(rule());
    rules.create(
      rule({
        template: { ...rule().template, amount: 3000, payee: 'Gym', categoryId: 'exp_health' },
        frequency: 'daily',
        startDate: '2026-09-27',
        mode: 'confirm',
      }),
    );
    rules.create(
      rule({
        template: { ...rule().template, payee: 'Later' },
        dayOfMonth: 10,
        startDate: '2026-10-10',
      }),
    );
    const actions = TestBed.inject(RecurringActions);
    const confirm = vi.spyOn(actions, 'confirm').mockResolvedValue();
    const { el } = await open();
    const items = [...el.querySelectorAll('app-upcoming-card .upcoming__item')];
    expect(items.map((i) => textOf(i.querySelector('.upcoming__row')!))).toEqual([
      'Gym Today · Bank Expense -$30.00',
      'Gym Tomorrow · Bank Expense -$30.00',
      'Gym Tue, Sep 29, 2026 · Bank Expense -$30.00',
      'Gym Wed, Sep 30, 2026 · Bank Expense -$30.00',
      'Gym Thu, Oct 1, 2026 · Bank Expense -$30.00',
      'Landlord Thu, Oct 1, 2026 · Bank Expense -$800.00',
      'Gym Fri, Oct 2, 2026 · Bank Expense -$30.00',
      'Gym Sat, Oct 3, 2026 · Bank Expense -$30.00',
      'Gym Sun, Oct 4, 2026 · Bank Expense -$30.00',
    ]);
    // Only the entry due today can be confirmed; the auto rule adds its own.
    expect(items.map((i) => i.querySelectorAll('l-button').length)).toEqual([
      2, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);

    items[0].querySelector<HTMLButtonElement>('l-button button')!.click();
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ name: 'Gym' }), '2026-09-27');
  });

  it('hides the upcoming card while nothing is due (DSH-08)', async () => {
    const { el } = await open();
    expect(el.querySelector('app-upcoming-card')).toBeNull();
  });

  it('masks every amount in privacy mode and remembers it on the device (DSH-09)', async () => {
    const { el, settle } = await open();
    el.querySelector<HTMLButtonElement>('.dash__privacy')!.click();
    await settle();
    const text = textOf(el.querySelector('.dash__grid')!);
    expect(text).not.toContain('$');
    expect(textOf(el.querySelector('app-summary-cards')!)).toContain('Income •••• ••••');
    expect(textOf(el.querySelector('.balances__total')!)).toContain('Total balance ••••');
    expect(textOf(el.querySelector('app-recent-card .tx-row__main')!)).toContain('••••');
    expect(el.querySelector('.dash__privacy')!.getAttribute('aria-pressed')).toBe('true');
    expect(readState<{ privacy?: boolean }>(DASHBOARD_LAYOUT_KEY, {}).privacy).toBe(true);
  });

  it('shows one empty state in place of the period cards when the period has no entries (DSH-13)', async () => {
    const { el } = await open('/dashboard?period=custom&from=2026-01-01&to=2026-01-31');
    expect(textOf(el.querySelector('.dash__card--empty')!)).toContain(
      'Nothing logged in January 2026',
    );
    expect(el.querySelector('app-summary-cards')).toBeNull();
    expect(el.querySelector('app-spending-card')).toBeNull();
    expect(el.querySelector('app-balances-card')).not.toBeNull();
    expect(el.querySelector('app-budgets-card')).not.toBeNull();
  });

  it('lets the user hide, reorder and bring back cards (DSH-15, DSH-16)', async () => {
    const layout = TestBed.inject(DashboardLayout);
    const { el, settle } = await open();
    const cards = () =>
      [...el.querySelectorAll('.dash__grid > .dash__card')].map((c) => c.tagName.toLowerCase());
    expect(cards()).toEqual([
      'app-summary-cards',
      'app-balances-card',
      'app-spending-card',
      'app-budgets-card',
      'app-trend-card',
      'app-recent-card',
    ]);

    layout.setShown('budgets', false);
    layout.setShown('largest', true);
    layout.move('recent', -4);
    await settle();
    expect(cards()).toEqual([
      'app-summary-cards',
      'app-recent-card',
      'app-balances-card',
      'app-spending-card',
      'app-trend-card',
      'app-largest-card',
    ]);
    expect([...el.querySelectorAll('app-largest-card .tx-row__title')].map(textOf)).toEqual([
      'Landlord',
      'Cafe',
      'Transport',
    ]);

    layout.reset();
    await settle();
    expect(cards()).toHaveLength(6);
    expect(readState<{ cards?: string[] }>(DASHBOARD_LAYOUT_KEY, {}).cards?.[0]).toBe('summary');
  });

  it('reads the period with one listener and the earlier periods with one range query (DSH-14)', async () => {
    const watch = vi.spyOn(TestBed.inject(TransactionsRepo), 'watchRange');
    const { router, settle } = await open();
    expect(watch.mock.calls.map(([range]) => range)).toEqual([
      { start: '2026-09-01', end: '2026-09-30' },
      { start: '2026-04-01', end: '2026-08-31' },
    ]);

    await router.navigateByUrl('/dashboard?period=last_month');
    await settle();
    expect(watch.mock.calls.slice(2).map(([range]) => range)).toEqual([
      { start: '2026-08-01', end: '2026-08-31' },
      { start: '2026-03-01', end: '2026-07-31' },
    ]);
  });
});
