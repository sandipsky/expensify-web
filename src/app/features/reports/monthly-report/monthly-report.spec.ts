import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TransactionsRepo } from '../../../core/data/transactions.repo';
import { NewTransaction } from '../../../core/models/transaction';
import { Preferences } from '../../../core/preferences';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { AccountsStore } from '../../accounts/accounts.store';
import { BudgetsStore } from '../../budgets/budgets.store';
import { CategoriesStore } from '../../categories/categories.store';
import { MonthlyReport } from './monthly-report';

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

describe('MonthlyReport (DAT-05)', () => {
  let cash: string;
  let bank: string;

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
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 27, 10));
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [{ path: 'reports/monthly', component: MonthlyReport }],
          withComponentInputBinding(),
        ),
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

    add({
      type: 'income',
      amount: 300000,
      accountId: bank,
      categoryId: 'inc_salary',
      date: '2026-09-01',
      payee: 'Acme',
    });
    add({ amount: 6000, payee: 'Cafe', date: '2026-09-12' });
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
    add({ amount: 99999, categoryId: 'exp_adjustment', date: '2026-09-20' });
    add({ amount: 4000, payee: 'August lunch', date: '2026-08-10' });
    TestBed.inject(BudgetsStore).create({
      name: 'Food',
      amount: 10000,
      period: 'monthly',
      categoryIds: ['exp_food'],
      rollover: false,
      alerts: false,
    });
  });

  afterEach(() => vi.useRealTimers());

  async function open(url: string) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    harness.detectChanges();
    await harness.fixture.whenStable();
    return harness;
  }

  it('sums up the month, leaving transfers and adjustments out of the totals', async () => {
    const harness = await open('/reports/monthly');
    const sheet = harness.routeNativeElement!.querySelector('.sheet')!;
    const text = textOf(sheet);
    expect(text).toContain('Monthly report September 2026');
    expect(text).toContain('Income +$3,000.00');
    expect(text).toContain('Expense -$860.00');
    expect(text).toContain('Net +$2,140.00');
    expect(text).toContain('Savings rate 71%');
    // Food grew from $40 in August to $60.
    expect(text).toContain('Change from the month before: income New, expense +2,050%');

    const tables = [...sheet.querySelectorAll('table')].map(textOf);
    expect(tables[0]).toContain('Housing and rent 1 93% $800.00');
    expect(tables[0]).toContain('Food and dining 1 7% $60.00');
    expect(tables[0]).not.toContain('adjustment');
    expect(tables[1]).toContain('Salary 1 100% $3,000.00');
    expect(tables[2]).toContain('Food On track $100.00 $60.00 $40.00 60%');
    expect(tables[3]).toContain('Bank $3,000.00 $1,300.00 +$1,700.00');
  });

  it('lists every entry of the month, oldest first, and can leave them out', async () => {
    const harness = await open('/reports/monthly');
    const el = harness.routeNativeElement!;
    const rows = [...el.querySelectorAll('.sheet__table--entries tbody tr')].map(textOf);
    expect(rows.map((r) => r.slice(0, 10))).toEqual([
      '2026-09-01',
      '2026-09-03',
      '2026-09-05',
      '2026-09-12',
      '2026-09-20',
    ]);
    expect(rows[1]).toContain('Transfer Bank → Cash $500.00');

    (harness.routeDebugElement!.componentInstance as MonthlyReport)['withEntries'].set(false);
    harness.detectChanges();
    expect(el.querySelector('.sheet__table--entries')).toBeNull();
  });

  it('pages to other months and prints the page', async () => {
    const harness = await open('/reports/monthly?offset=-1');
    const el = harness.routeNativeElement!;
    expect(textOf(el.querySelector('.sheet__header')!)).toContain('August 2026');
    expect(textOf(el)).toContain('August lunch');

    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    [...el.querySelectorAll<HTMLButtonElement>('l-button button')]
      .find((b) => b.textContent?.includes('Save as PDF'))!
      .click();
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });
});
