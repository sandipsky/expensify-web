import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { TransactionsRepo } from '../../../core/data/transactions.repo';
import { BudgetInput } from '../../../core/models/budget';
import { Preferences } from '../../../core/preferences';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { AccountsStore } from '../../accounts/accounts.store';
import { CategoriesStore } from '../../categories/categories.store';
import { BudgetActions } from '../budget-actions';
import { BudgetsStore } from '../budgets.store';
import { BudgetsPage } from './budgets-page';

const input = (overrides: Partial<BudgetInput> = {}): BudgetInput => ({
  name: 'Food',
  amount: 50000,
  period: 'monthly',
  categoryIds: ['exp_food'],
  rollover: false,
  alerts: true,
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

describe('BudgetsPage', () => {
  const actions = {
    create: vi.fn(() => of(undefined)),
    edit: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    delete: vi.fn(),
  };
  let store: BudgetsStore;
  let cash: string;

  const spend = (amount: number, date = '2026-09-20') =>
    TestBed.inject(TransactionsRepo).add({
      type: 'expense',
      amount,
      currency: 'USD',
      accountId: cash,
      categoryId: 'exp_food',
      date,
      tags: [],
    });

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
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
        { provide: BudgetActions, useValue: actions },
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
  });

  afterEach(() => vi.useRealTimers());

  async function render() {
    const fixture = TestBed.createComponent(BudgetsPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const texts = (selector: string) => [...el.querySelectorAll(selector)].map(textOf);
    const button = (label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('l-button button, [dropdown-item]')].find(
        (b) => b.textContent?.trim() === label,
      )!;
    return { fixture, el, texts, button };
  }

  it('offers to add the first budget', async () => {
    const { el, button } = await render();
    expect(textOf(el.querySelector('app-empty-state')!)).toContain('No budgets yet');
    button('Add budget').click();
    expect(actions.create).toHaveBeenCalled();
  });

  it("shows each budget's spent, limit, state and safe-to-spend (BUD-02, BUD-03)", async () => {
    store.create(input());
    spend(38000);
    spend(5000, '2026-09-26');
    const { el, texts } = await render();

    expect(texts('.budget-card__title')).toEqual(['Food Monthly · Food and dining']);
    expect(texts('app-budget-meter')).toEqual([
      '$430.00 of $500.00 86% Warning $70.00 left September 2026 · 5 days left $14.00 a day to spend',
    ]);
    const bar = el.querySelector('l-progress')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('86');
    expect(bar.getAttribute('aria-label')).toBe('Food budget used');
    expect(el.querySelector('l-chip')!.getAttribute('class')).toContain('warn');
  });

  it('says how much a budget is over and what rolled over (BUD-03, BUD-07)', async () => {
    store.create(input({ categoryIds: [], name: 'Everything', rollover: true }));
    spend(60000);
    const { texts } = await render();

    // Created today, so nothing rolls in from before it existed.
    expect(texts('app-budget-meter')[0]).toContain('Over $100.00 over');
    expect(texts('.budget-meter__carry')).toEqual([]);
    expect(texts('.budget-meter__per-day')).toEqual(['Nothing left to spend']);
  });

  it('keeps paused budgets apart, with Resume', async () => {
    const id = store.create(input());
    store.setActive(store.byId(id)!, false);
    const { fixture, el, texts, button } = await render();

    expect(textOf(el.querySelector('app-empty-state')!)).toContain('All your budgets are paused');
    expect(texts('l-accordion-item .budget-card__paused')).toEqual(['$500.00 a month Paused']);

    (el.querySelector('l-accordion-item [dropdown-display] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    button('Resume').click();
    expect(actions.resume).toHaveBeenCalledWith(store.byId(id));
  });

  it('links each card to its budget page (BUD-05)', async () => {
    const id = store.create(input());
    const { el } = await render();
    expect(el.querySelector('.budget-card__link')!.getAttribute('href')).toBe(`/budgets/${id}`);
  });
});
