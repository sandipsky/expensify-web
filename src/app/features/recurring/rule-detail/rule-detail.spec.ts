import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { RecurringRepo } from '../../../core/data/recurring.repo';
import { Preferences } from '../../../core/preferences';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { NotificationService } from '../../../shared/components/ui/notification';
import { AccountsStore } from '../../accounts/accounts.store';
import { CategoriesStore } from '../../categories/categories.store';
import { TransactionActions } from '../../transactions/transaction-actions';
import { RuleDetail } from './rule-detail';

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

describe('RuleDetail', () => {
  const transactions = { edit: vi.fn(() => of(undefined)) };
  let bank: string;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 27, 10));
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
        { provide: NotificationService, useValue: { success: vi.fn(), info: vi.fn() } },
        { provide: TransactionActions, useValue: transactions },
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

  /** A salary on the 1st that has created July to September. */
  async function salary() {
    const repo = TestBed.inject(RecurringRepo);
    const id = repo.create({
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
      startDate: '2026-07-01',
      endType: 'count',
      endDate: null,
      maxCount: 12,
      occurrences: 0,
      nextDueDate: '2026-07-01',
      mode: 'auto',
      active: true,
    });
    await repo.generate(id, '2026-09-27');
    return id;
  }

  async function setup(id: string) {
    const fixture = TestBed.createComponent(RuleDetail);
    fixture.componentRef.setInput('id', id);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const card = (title: string) =>
      [...el.querySelectorAll('l-card')].find((c) => textOf(c).startsWith(title))!;
    return { fixture, el, card };
  }

  it('shows the rule, how it ends and its next dates (REC-02, REC-03)', async () => {
    const { el, card } = await setup(await salary());
    expect(textOf(el.querySelector('.rule-page__header')!)).toContain(
      'Acme Every month on the 1st',
    );
    expect(textOf(card('Details'))).toBe(
      'Details Amount Income +$3,000.00 Category Salary Account Bank Starts Wed, Jul 1, 2026 ' +
        'Ends Ends after 12 entries (9 left) On the due date Adds it automatically ' +
        'Added so far 3 entries Next dates Thu, Oct 1, 2026 Sun, Nov 1, 2026 Tue, Dec 1, 2026 ' +
        'Fri, Jan 1, 2027 Mon, Feb 1, 2027',
    );
  });

  it('lists the entries it created, newest first and dated, and opens one', async () => {
    const { card } = await setup(await salary());
    const rows = [...card('Entries added').querySelectorAll('app-transaction-row')];
    expect(rows.map((r) => textOf(r.querySelector('.tx-row__subtitle')!))).toEqual([
      'Tue, Sep 1, 2026 · Salary · Bank',
      'Sat, Aug 1, 2026 · Salary · Bank',
      'Wed, Jul 1, 2026 · Salary · Bank',
    ]);
    rows[0].querySelector<HTMLButtonElement>('button')!.click();
    expect(transactions.edit).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-09-01' }));
  });

  it('says so when the rule is gone', async () => {
    const { el } = await setup('missing');
    expect(textOf(el)).toContain('Rule not found');
  });
});
