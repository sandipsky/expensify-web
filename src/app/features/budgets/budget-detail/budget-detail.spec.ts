import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BudgetsRepo } from '../../../core/data/budgets.repo';
import { TransactionsRepo } from '../../../core/data/transactions.repo';
import { Preferences } from '../../../core/preferences';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { AccountsStore } from '../../accounts/accounts.store';
import { CategoriesStore } from '../../categories/categories.store';
import { TransactionActions } from '../../transactions/transaction-actions';
import { BudgetActions } from '../budget-actions';
import { BudgetDetail } from './budget-detail';

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

describe('BudgetDetail', () => {
  const actions = { edit: vi.fn(), pause: vi.fn(), resume: vi.fn(), delete: vi.fn() };
  const transactions = { create: vi.fn(() => of(undefined)), edit: vi.fn(() => of(undefined)) };
  let cash: string;

  const at = (month: number, day: number) => vi.setSystemTime(new Date(2026, month - 1, day, 10));

  const spend = (amount: number, date: string, payee = 'Cafe') =>
    TestBed.inject(TransactionsRepo).add({
      type: 'expense',
      amount,
      currency: 'USD',
      accountId: cash,
      categoryId: 'exp_food',
      date,
      payee,
      tags: [],
    });

  /** A Food budget of 500.00 created on 1 July. */
  const createBudget = () => {
    at(7, 1);
    const id = TestBed.inject(BudgetsRepo).create({
      name: 'Food',
      amount: 50000,
      period: 'monthly',
      categoryIds: ['exp_food'],
      rollover: false,
      alertThresholds: [80, 100],
      active: true,
    });
    at(9, 26);
    return id;
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    at(9, 26);
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
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
        { provide: BudgetActions, useValue: actions },
        { provide: TransactionActions, useValue: transactions },
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
  });

  afterEach(() => vi.useRealTimers());

  async function render(id: string) {
    const fixture = TestBed.createComponent(BudgetDetail);
    fixture.componentRef.setInput('id', id);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const texts = (selector: string) => [...el.querySelectorAll(selector)].map(textOf);
    const button = (label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('l-button button, [dropdown-item]')].find(
        (b) => b.textContent?.trim() === label,
      )!;
    return { fixture, el, texts, button };
  }

  it('shows this period and the results of past periods (BUD-05)', async () => {
    const id = createBudget();
    spend(43000, '2026-09-10');
    spend(60000, '2026-08-10');
    spend(20000, '2026-07-10');
    const { el, texts } = await render(id);

    expect(el.querySelector('h1')!.textContent).toBe('Food');
    expect(texts('.budget-page__meta')).toEqual(['Monthly limit · Food and dining']);
    expect(texts('app-budget-meter')[0]).toContain('$430.00 of $500.00 86% Warning');

    const rows = texts('.period-row');
    expect(rows).toHaveLength(7);
    expect(rows.slice(0, 4)).toEqual([
      'September 2026 This period $430.00 of $500.00 Warning 86% used',
      'August 2026 $600.00 of $500.00 Over 120% used',
      'July 2026 $200.00 of $500.00 On track 40% used',
      'June 2026 $0.00 of $500.00 Before this budget started 0% used',
    ]);
  });

  it("lists the selected period's transactions, newest first", async () => {
    const id = createBudget();
    spend(1000, '2026-09-10', 'Bakery');
    spend(2000, '2026-09-20', 'Market');
    spend(3000, '2026-08-10', 'Diner');
    const { fixture, el, texts } = await render(id);

    expect(textOf(el)).toContain('Transactions · September 2026');
    expect(texts('app-transaction-row .tx-row__title')).toEqual(['Market', 'Bakery']);

    const august = el.querySelectorAll<HTMLButtonElement>('.period-row')[1];
    august.click();
    fixture.detectChanges();
    expect(august.getAttribute('aria-pressed')).toBe('true');
    expect(textOf(el)).toContain('Transactions · August 2026');
    expect(texts('app-transaction-row .tx-row__title')).toEqual(['Diner']);

    el.querySelector<HTMLButtonElement>('app-transaction-row .tx-row__main')!.click();
    expect(transactions.edit).toHaveBeenCalledWith(expect.objectContaining({ payee: 'Diner' }));
  });

  it("offers an expense in the budget's category when this period is empty", async () => {
    const id = createBudget();
    const { el, button } = await render(id);

    expect(textOf(el)).toContain('Nothing spent in this period');
    button('Add expense').click();
    expect(transactions.create).toHaveBeenCalledWith({ type: 'expense', categoryId: 'exp_food' });
  });

  it('goes back to the list after deleting', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const id = createBudget();
    const { fixture, el, button } = await render(id);

    el.querySelector<HTMLButtonElement>('.budget-page__actions [dropdown-display] button')!.click();
    fixture.detectChanges();
    button('Delete').click();
    expect(actions.delete).toHaveBeenCalledWith(expect.objectContaining({ id }));
    expect(navigate).toHaveBeenCalledWith('/budgets');
  });

  it('says so when the budget is gone', async () => {
    const { el } = await render('missing');
    expect(textOf(el)).toContain('Budget not found');
  });
});
