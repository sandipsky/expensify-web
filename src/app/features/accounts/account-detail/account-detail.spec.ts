import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { addDays, format } from 'date-fns';
import { TransactionsRepo } from '../../../core/data/transactions.repo';
import { AccountInput } from '../../../core/models/account';
import { NewTransaction } from '../../../core/models/transaction';
import { Preferences } from '../../../core/preferences';
import { BreakpointService } from '../../../layout/breakpoint.service';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { AccountActions } from '../account-actions';
import { AccountsStore } from '../accounts.store';
import { AccountDetail } from './account-detail';

const input = (overrides: Partial<AccountInput> = {}): AccountInput => ({
  name: 'Bank',
  type: 'bank',
  openingBalance: 100000,
  creditLimit: null,
  includeInTotal: true,
  ...overrides,
});

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

describe('AccountDetail', () => {
  const actions = {
    edit: vi.fn(),
    reconcile: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    delete: vi.fn(() => Promise.resolve(true)),
  };

  let store: AccountsStore;
  let transactions: TransactionsRepo;
  const desktop = signal(false);

  const tx = (accountId: string, overrides: Partial<NewTransaction>): NewTransaction => ({
    type: 'expense',
    amount: 1000,
    currency: 'USD',
    accountId,
    categoryId: 'exp_food',
    date: '2026-09-26',
    tags: [],
    ...overrides,
  });

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    desktop.set(false);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Preferences,
          useValue: { locale: signal('en-US'), baseCurrency: signal('USD') },
        },
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
        { provide: AccountActions, useValue: actions },
        {
          provide: BreakpointService,
          useValue: { phone: signal(false), desktop, tablet: signal(true) },
        },
      ],
    });
    store = TestBed.inject(AccountsStore);
    transactions = TestBed.inject(TransactionsRepo);
  });

  async function render(id: string) {
    const fixture = TestBed.createComponent(AccountDetail);
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

  it("shows the account's balance and opening balance", async () => {
    const id = store.create(input());
    transactions.add(tx(id, { amount: 2500 }));
    const { el, texts } = await render(id);

    expect(el.querySelector('h1')!.textContent).toBe('Bank');
    expect(texts('.account-stat')).toEqual([
      'Current balance $975.00',
      'Opening balance $1,000.00',
    ]);
  });

  it('shows cards as amounts owed with their credit use (ACC-08)', async () => {
    const id = store.create(
      input({ name: 'Visa', type: 'credit_card', openingBalance: -25000, creditLimit: 100000 }),
    );
    const { el, texts } = await render(id);

    expect(texts('.account-stat')).toEqual([
      'Amount owed $250.00',
      'Opening amount owed $250.00',
      'Credit limit $1,000.00 25% used',
    ]);
    expect(el.querySelector('l-progress')!.getAttribute('aria-valuenow')).toBe('25');
  });

  it("tracks a card's running amount owed rather than a negative balance (ACC-08)", async () => {
    const id = store.create(input({ name: 'Visa', type: 'credit_card', openingBalance: -25000 }));
    transactions.add(tx(id, { amount: 1000, payee: 'Cafe' }));
    const { texts } = await render(id);

    expect(texts('.activity-row .activity-amount')).toEqual(['-$10.00']);
    expect(texts('.activity-row__balance')).toEqual(['Owed after: $260.00']);
    expect(texts('.activity-footer')).toEqual(['Opening amount owed $250.00']);

    desktop.set(true);
    const table = await render(id);
    expect(table.texts('l-table th')).toEqual(['Date', 'Description', 'Amount', 'Owed']);
    expect(table.texts('l-table tbody tr')).toEqual(['Sat, Sep 26, 2026 Cafe -$10.00 $260.00']);
  });

  it('lists transactions by day, newest first, with the balance after each (ACC-06)', async () => {
    const bank = store.create(input());
    const cash = store.create(input({ name: 'Cash', type: 'cash', openingBalance: 0 }));
    transactions.add(
      tx(bank, {
        type: 'income',
        amount: 50000,
        categoryId: 'inc_salary',
        date: '2026-09-25',
        time: '10:00',
      }),
    );
    transactions.add(
      tx(bank, {
        amount: 20000,
        date: '2026-09-26',
        time: '09:00',
        payee: 'Grocer',
        note: 'Weekly shop',
      }),
    );
    transactions.add(
      tx(bank, {
        type: 'transfer',
        amount: 30000,
        toAccountId: cash,
        categoryId: null,
        date: '2026-09-26',
        time: '18:00',
      }),
    );
    const { texts } = await render(bank);

    expect(texts('.activity-day__label')).toEqual(['Sat, Sep 26, 2026', 'Fri, Sep 25, 2026']);
    expect(texts('.activity-row__title')).toEqual(['Transfer to Cash', 'Grocer', 'Income']);
    expect(texts('.activity-row__subtitle')).toEqual(['18:00', '09:00 · Weekly shop', '10:00']);
    expect(texts('.activity-row .activity-amount')).toEqual(['-$300.00', '-$200.00', '+$500.00']);
    expect(texts('.activity-row__balance')).toEqual([
      'Balance after: $1,000.00',
      'Balance after: $1,300.00',
      'Balance after: $1,500.00',
    ]);
    expect(texts('.activity-footer')).toEqual(['Opening balance $1,000.00']);
  });

  it('names balance adjustments and transfers in from the other side', async () => {
    const bank = store.create(input());
    const cash = store.create(input({ name: 'Cash', type: 'cash', openingBalance: 0 }));
    transactions.add(
      tx(bank, { type: 'transfer', amount: 5000, toAccountId: cash, categoryId: null }),
    );
    store.reconcile(store.byId(cash)!, 4000);
    const { texts } = await render(cash);

    expect(texts('.activity-row__title')).toEqual(['Balance adjustment', 'Transfer from Bank']);
  });

  it('uses a table on desktop', async () => {
    desktop.set(true);
    const id = store.create(input());
    transactions.add(tx(id, { amount: 2500, payee: 'Cafe' }));
    const { el, texts } = await render(id);

    expect(el.querySelector('.activity-day')).toBeNull();
    expect(texts('l-table tbody tr')).toEqual(['Sat, Sep 26, 2026 Cafe -$25.00 $975.00']);
  });

  it('loads 50 entries at a time, holding back a possibly partial last day', async () => {
    const id = store.create(input());
    for (let i = 0; i < 60; i++) {
      transactions.add(
        tx(id, { amount: 100, date: format(addDays(new Date(2026, 0, 1), i), 'yyyy-MM-dd') }),
      );
    }
    const { fixture, el, button, texts } = await render(id);
    expect(el.querySelectorAll('.activity-row').length).toBe(49);
    expect(texts('.activity-footer')).toEqual(['Load more']);

    button('Load more').click();
    await fixture.whenStable();
    expect(el.querySelectorAll('.activity-row').length).toBe(60);
    expect(texts('.activity-footer')).toEqual(['Opening balance $1,000.00']);
    expect(texts('.activity-row__balance').at(-1)).toBe('Balance after: $999.00');
  });

  it('offers to reconcile when there are no transactions yet', async () => {
    const id = store.create(input());
    const { texts, button } = await render(id);

    expect(texts('app-empty-state .empty-state__title')).toEqual(['No transactions yet']);
    button('Reconcile balance').click();
    expect(actions.reconcile).toHaveBeenCalledWith(expect.objectContaining({ id }));
  });

  it('shows an archived account with a notice and Restore instead of edit actions', async () => {
    const id = store.create(input());
    store.setArchived(store.byId(id)!, true);
    const { el, button } = await render(id);

    expect(el.querySelector('.alert.warn')).not.toBeNull();
    expect(button('Edit')).toBeUndefined();
    button('Restore').click();
    expect(actions.restore).toHaveBeenCalled();
  });

  it('returns to Accounts after the account is deleted', async () => {
    const id = store.create(input());
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    const { fixture, el, button } = await render(id);

    el.querySelector<HTMLButtonElement>('l-menu l-button button')!.click();
    fixture.detectChanges();
    button('Delete').click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/accounts'));
  });

  it('says so when the account does not exist', async () => {
    const { texts } = await render('missing');
    expect(texts('.empty-state__title')).toEqual(['Account not found']);
  });
});
