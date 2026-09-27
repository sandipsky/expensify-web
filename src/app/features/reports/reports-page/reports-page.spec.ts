import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TransactionsRepo } from '../../../core/data/transactions.repo';
import { NewTransaction } from '../../../core/models/transaction';
import { Preferences } from '../../../core/preferences';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { AccountsStore } from '../../accounts/accounts.store';
import { CategoriesStore } from '../../categories/categories.store';
import { ReportsPage } from './reports-page';

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

describe('ReportsPage', () => {
  const originalMatchMedia = window.matchMedia;
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

  beforeEach(() => {
    localStorage.clear();
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
          { path: 'reports', component: ReportsPage },
          { path: 'transactions', component: Blank },
        ]),
        {
          provide: Preferences,
          useValue: {
            locale: signal('en-US'),
            baseCurrency: signal('USD'),
            monthStartDay: signal(1),
            weekStartDay: signal(1),
          },
        },
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
      ],
    });
    TestBed.inject(CategoriesStore).seedDefaults();
    const accounts = TestBed.inject(AccountsStore);
    const account = (name: string) =>
      accounts.create({
        name,
        type: 'cash',
        openingBalance: 0,
        creditLimit: null,
        includeInTotal: true,
      });
    bank = account('Bank');
    cash = account('Cash');

    // September: salary, food (a subcategory too), rent, a transfer and an adjustment.
    add({
      type: 'income',
      amount: 300000,
      accountId: bank,
      categoryId: 'inc_salary',
      date: '2026-09-01',
      payee: 'Acme',
    });
    add({ amount: 6000, categoryId: 'exp_food', payee: 'Cafe', date: '2026-09-12' });
    add({ amount: 2000, categoryId: 'exp_groceries', payee: 'cafe ' });
    add({
      amount: 80000,
      accountId: bank,
      categoryId: 'exp_housing',
      payee: 'Landlord',
      date: '2026-09-05',
    });
    add({
      type: 'transfer',
      amount: 50000,
      accountId: bank,
      toAccountId: cash,
      categoryId: null,
      date: '2026-09-03',
    });
    add({ amount: 99999, categoryId: 'exp_adjustment' });
    // August, for the comparison and the trend.
    add({ amount: 4000, categoryId: 'exp_food', date: '2026-08-10' });
    add({
      type: 'income',
      amount: 300000,
      accountId: bank,
      categoryId: 'inc_salary',
      date: '2026-08-01',
    });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.useRealTimers();
  });

  async function open(url: string) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    TestBed.tick();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    const el = harness.routeNativeElement as HTMLElement;
    const router = TestBed.inject(Router);
    return { harness, el, router };
  }

  it('breaks expenses down by category with amount and share, without transfers or adjustments (RPT-01)', async () => {
    const { el } = await open('/reports');
    const rows = [...el.querySelectorAll('app-category-report app-report-row')].map(textOf);
    expect(rows).toEqual([
      'Housing and rent 1 entry $800.00 91%',
      'Food and dining 1 entry $60.00 7%',
      'Groceries 1 entry $20.00 2%',
    ]);
    expect(textOf(el.querySelector('.l-donut-chart__center')!)).toBe('$880.00 3 entries');
  });

  it('opens a category’s entries for the period from its row (RPT-04)', async () => {
    const { el, router } = await open('/reports');
    el.querySelectorAll<HTMLButtonElement>('app-report-row button')[1].click();
    await vi.waitFor(() => expect(router.url).toContain('/transactions'));
    expect(router.url).toBe(
      '/transactions?from=2026-09-01&to=2026-09-30&type=expense&category=exp_food',
    );
  });

  it('keeps the report in the URL, so Back from a drill-down returns to it', async () => {
    const { el, router, harness } = await open('/reports?type=income');
    expect(textOf(el.querySelector('app-category-report')!)).toContain(
      'Salary 1 entry $3,000.00 100%',
    );
    const store = harness.routeDebugElement!.injector.get(
      (await import('../reports.store')).ReportsStore,
    );
    store.set({ view: 'payees' });
    await vi.waitFor(() => expect(router.url).toBe('/reports?type=income&view=payees'));
  });

  it('shows the last 12 months with totals, per-month rows and net captions (RPT-02)', async () => {
    const { el } = await open('/reports?view=trend');
    expect(el.querySelectorAll('l-bar-chart .l-bar-chart__group')).toHaveLength(12);
    const table = el.querySelector('app-period-table')!;
    const body = [...table.querySelectorAll('tbody tr')];
    expect(body).toHaveLength(12);
    expect(textOf(body[11])).toBe('September 2026 Sep 2026 $3,000.00 $880.00 +$2,120.00 71%');
    expect(textOf(table.querySelector('tfoot')!)).toBe(
      '12 months $6,000.00 $920.00 +$5,080.00 85%',
    );
    expect(textOf(el.querySelector('app-summary-tiles')!)).toBe(
      'Income +$6,000.00 Expense -$920.00 Net +$5,080.00 Savings rate 85%',
    );
  });

  it('compares two periods by category with the change in amount and % (RPT-03)', async () => {
    const { el } = await open('/reports?view=compare');
    const rows = [...el.querySelectorAll('app-compare-report tbody tr')].map(textOf);
    expect(rows).toEqual([
      'Housing and rent $0.00 → $800.00 $0.00 $800.00 +$800.00 New',
      'Food and dining $40.00 → $60.00 $40.00 $60.00 +$20.00 +50%',
      'Groceries $0.00 → $20.00 $0.00 $20.00 +$20.00 New',
    ]);
    expect(textOf(el.querySelector('app-compare-report tfoot')!)).toBe(
      'Total $40.00 $880.00 +$840.00 +2,100%',
    );
  });

  it('summarizes a year by month and steps back a year (RPT-05)', async () => {
    const { el, router } = await open('/reports?view=year');
    expect(textOf(el.querySelector('.reports-toolbar__year')!)).toContain('2026');
    expect(el.querySelectorAll('app-period-table tbody tr')).toHaveLength(12);
    expect(textOf(el.querySelector('app-period-table tfoot')!)).toBe(
      'Year $6,000.00 $920.00 +$5,080.00 85%',
    );

    el.querySelector<HTMLButtonElement>('.reports-toolbar__year l-button button')!.click();
    await vi.waitFor(() => expect(router.url).toBe('/reports?view=year&year=-1'));
  });

  it('shows money in and out per account, transfers included (RPT-06)', async () => {
    const { el } = await open('/reports?view=accounts');
    const rows = [...el.querySelectorAll('app-cash-flow-report app-report-row')].map(textOf);
    expect(rows).toEqual([
      'Bank In $3,000.00 · Out $1,300.00 ($500.00 transfers) +$1,700.00 net',
      'Cash In $500.00 ($500.00 transfers) · Out $80.00 +$420.00 net',
    ]);
  });

  it('lists top payees ignoring case, and the largest expenses (RPT-07)', async () => {
    const { el, router } = await open('/reports?view=payees');
    const payees = [...el.querySelectorAll('app-payees-report app-report-row')].map(textOf);
    expect(payees).toEqual(['Landlord 1 entry $800.00 91%', 'Cafe 2 entries $80.00 9%']);
    const largest = [...el.querySelectorAll('app-payees-report app-transaction-row')];
    expect(largest.map((r) => textOf(r.querySelector('.tx-row__title')!))).toEqual([
      'Landlord',
      'Cafe',
      'cafe',
    ]);

    el.querySelectorAll<HTMLButtonElement>('app-report-row button')[1].click();
    await vi.waitFor(() => expect(router.url).toContain('/transactions'));
    expect(router.url).toBe('/transactions?from=2026-09-01&to=2026-09-30&type=expense&q=Cafe');
  });
});
