import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { NewTransaction } from '../../../core/models/transaction';
import { Preferences } from '../../../core/preferences';
import { BreakpointService } from '../../../layout/breakpoint.service';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { NotificationService } from '../../../shared/components/ui/notification';
import { AccountsStore } from '../../accounts/accounts.store';
import { CategoriesStore } from '../../categories/categories.store';
import { TransactionActions } from '../transaction-actions';
import { TransactionsStore } from '../transactions.store';
import { TransactionsPage } from './transactions-page';

const account = { openingBalance: 0, creditLimit: null, includeInTotal: true };

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

describe('TransactionsPage', () => {
  const actions = {
    create: vi.fn(() => of(undefined)),
    edit: vi.fn(() => of(undefined)),
    deleteMany: vi.fn(() => Promise.resolve(true)),
    recategorize: vi.fn(() => Promise.resolve(true)),
    move: vi.fn(() => Promise.resolve(true)),
  };
  const toasts = { warn: vi.fn(), info: vi.fn(), success: vi.fn(), error: vi.fn() };
  const desktop = signal(false);
  let store: TransactionsStore;
  let cash: string;
  let bank: string;

  const add = (overrides: Partial<NewTransaction>) =>
    store.add({
      type: 'expense',
      amount: 1000,
      currency: 'USD',
      accountId: cash,
      categoryId: 'exp_food',
      date: '2026-09-20',
      tags: [],
      ...overrides,
    });

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    desktop.set(false);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 27, 10, 0));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Preferences,
          useValue: {
            locale: signal('en-US'),
            baseCurrency: signal('USD'),
            monthStartDay: signal(1),
          },
        },
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
        { provide: TransactionActions, useValue: actions },
        { provide: NotificationService, useValue: toasts },
        {
          provide: BreakpointService,
          useValue: { phone: signal(false), desktop, tablet: signal(true) },
        },
      ],
    });
    const accounts = TestBed.inject(AccountsStore);
    cash = accounts.create({ ...account, name: 'Cash', type: 'cash' });
    bank = accounts.create({ ...account, name: 'Bank', type: 'bank' });
    TestBed.inject(CategoriesStore).seedDefaults();
    store = TestBed.inject(TransactionsStore);
  });

  afterEach(() => vi.useRealTimers());

  async function render(inputs: Record<string, string | boolean> = {}) {
    const fixture = TestBed.createComponent(TransactionsPage);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    await fixture.whenStable();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const texts = (selector: string) => [...el.querySelectorAll(selector)].map(textOf);
    const button = (label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('l-button button')].find(
        (b) => textOf(b) === label,
      )!;
    return { fixture, el, texts, button };
  }

  it("shows the month's entries by day, with each day's net and signed amounts (LST-01, NFR-09)", async () => {
    add({
      date: '2026-09-26',
      payee: 'Fresh Mart',
      categoryId: 'exp_groceries',
      time: '09:15',
      tags: ['home'],
    });
    add({ date: '2026-09-26', type: 'income', categoryId: 'inc_salary', amount: 50000 });
    add({
      date: '2026-09-20',
      type: 'transfer',
      categoryId: null,
      toAccountId: bank,
      amount: 2500,
    });
    const { texts } = await render();

    expect(texts('.tx-day')).toEqual([
      'Yesterday · Sat, Sep 26, 2026 Net +$490.00',
      'Sun, Sep 20, 2026 Net $0.00',
    ]);
    expect(texts('app-transaction-row')).toEqual([
      'Fresh Mart Groceries · Cash · 09:15 · #home Expense -$10.00',
      'Salary Cash Income +$500.00',
      'Transfer Cash → Bank Transfer $25.00',
    ]);
  });

  it('totals what is shown without transfers (LST-03, TXN-09)', async () => {
    add({ type: 'income', categoryId: 'inc_salary', amount: 50000 });
    add({ amount: 1250 });
    add({ type: 'transfer', categoryId: null, toAccountId: bank, amount: 9999 });
    const { texts } = await render();
    expect(texts('.tx-totals__item')).toEqual([
      'Income +$500.00',
      'Expense -$12.50',
      'Net +$487.50',
    ]);
  });

  it('labels future-dated entries upcoming (TXN-14)', async () => {
    add({ date: '2026-09-29', payee: 'Rent' });
    const { texts } = await render();
    expect(texts('app-transaction-row l-chip')).toEqual(['Upcoming']);
    expect(texts('.tx-day')[0]).toContain('Tue, Sep 29, 2026');
  });

  it('offers to add the first entry when the period is empty (LST-05)', async () => {
    const { texts, button } = await render();
    expect(texts('app-empty-state .empty-state__title')).toEqual([
      'No transactions in September 2026',
    ]);
    button('Add transaction').click();
    expect(actions.create).toHaveBeenCalled();
  });

  it('searches payee, note and tags, and offers to clear when nothing matches (LST-06, LST-05)', async () => {
    add({ payee: 'Fresh Mart' });
    add({ note: 'Bus to work', categoryId: 'exp_transport' });
    const { fixture, el, texts, button } = await render();
    const search = el.querySelector<HTMLInputElement>('.tx-toolbar__search input')!;
    expect(search.getAttribute('aria-label')).toBe('Search transactions');

    search.value = 'bus';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(texts('app-transaction-row .tx-row__title')).toEqual(['Transport']);

    search.value = 'nothing like it';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(texts('app-empty-state .empty-state__title')).toEqual(['No matches']);
    button('Clear search and filters').click();
    fixture.detectChanges();
    expect(texts('app-transaction-row')).toHaveLength(2);
  });

  it('opens an entry when tapped (TXN-06)', async () => {
    add({ payee: 'Fresh Mart' });
    const { el } = await render();
    el.querySelector<HTMLButtonElement>('app-transaction-row .tx-row__main')!.click();
    expect(actions.edit).toHaveBeenCalledWith(expect.objectContaining({ payee: 'Fresh Mart' }));
  });

  it('shows a sortable table grouped by day on desktop', async () => {
    desktop.set(true);
    add({ date: '2026-09-26', payee: 'Fresh Mart', categoryId: 'exp_groceries' });
    add({ date: '2026-09-20', payee: 'Corner Cafe' });
    const { el, texts } = await render();

    expect(texts('thead th')).toEqual(['Date', 'Description', 'Category', 'Account', 'Amount']);
    expect(texts('.l-table__group')).toEqual([
      'Yesterday · Sat, Sep 26, 2026 Net -$10.00',
      'Sun, Sep 20, 2026 Net -$10.00',
    ]);
    el.querySelector<HTMLButtonElement>('.tx-cell__open')!.click();
    expect(actions.edit).toHaveBeenCalledTimes(1);
  });

  it('selects entries for a bulk action and leaves selection mode after it (TXN-13)', async () => {
    add({ payee: 'A' });
    add({ payee: 'B', date: '2026-09-21' });
    const { fixture, el, texts, button } = await render();
    button('Select').click();
    fixture.detectChanges();

    const boxes = el.querySelectorAll<HTMLInputElement>('app-transaction-row l-checkbox input');
    expect(boxes[0].getAttribute('aria-label')).toBe('Select B, Mon, Sep 21, 2026');
    boxes[0].click();
    fixture.detectChanges();
    expect(texts('.tx-bulk__count')).toEqual(['1 selected']);

    button('Delete').click();
    await fixture.whenStable();
    expect(actions.deleteMany).toHaveBeenCalledWith([expect.objectContaining({ payee: 'B' })]);
    fixture.detectChanges();
    expect(el.querySelector('.tx-bulk')).toBeNull();
  });

  describe('deep links (§10 routes)', () => {
    it('/transactions/new opens quick add, then returns to the list', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await render({ quickAdd: true });
      expect(actions.create).toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(['/transactions'], { replaceUrl: true });
    });

    it('/transactions/:id opens that entry, or says it is gone', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const id = add({ payee: 'Fresh Mart' });
      await render({ id });
      expect(actions.edit).toHaveBeenCalledWith(expect.objectContaining({ id }));

      await render({ id: 'missing' });
      expect(toasts.warn).toHaveBeenCalledWith('Transaction not found', expect.any(String));
      expect(navigate).toHaveBeenCalledTimes(2);
    });

    it('a drill-down from a report sets the period and filters, then leaves the URL plain (RPT-04)', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      add({ payee: 'Cafe Nero', date: '2026-08-10' });
      add({ payee: 'Cafe Nero', date: '2026-08-11', accountId: bank });
      add({ payee: 'Cafe Nero', date: '2026-08-12', categoryId: 'exp_transport' });
      add({ payee: 'Market', date: '2026-08-13' });
      add({ payee: 'Cafe Nero', date: '2026-09-10' });
      const { el, texts } = await render({
        from: '2026-08-01',
        to: '2026-08-31',
        type: 'expense',
        category: 'exp_food,exp_groceries',
        account: cash,
        q: 'cafe',
      });
      expect(navigate).toHaveBeenCalledWith(['/transactions'], { replaceUrl: true });
      // "Last month" on 27 Sep, so it shows as that preset rather than Custom.
      expect(textOf(el.querySelector('.tx-toolbar__label')!)).toBe('August 2026');
      expect(texts('.tx-chips li')).toEqual([
        'Expense',
        'Cash',
        'Food and dining',
        'Groceries',
        'Clear all',
      ]);
      expect(texts('.tx-row__title')).toEqual(['Cafe Nero']);
      expect(el.querySelector<HTMLInputElement>('.tx-toolbar__search input')!.value).toBe('cafe');
    });
  });
});
