import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { TransactionsRepo } from '../../../core/data/transactions.repo';
import { RecurringRuleInput } from '../../../core/models/recurring';
import { Preferences } from '../../../core/preferences';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { NotificationService } from '../../../shared/components/ui/notification';
import { AccountsStore } from '../../accounts/accounts.store';
import { CategoriesStore } from '../../categories/categories.store';
import { RecurringActions } from '../recurring-actions';
import { RecurringStore } from '../recurring.store';
import { RecurringPage } from './recurring-page';

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

describe('RecurringPage', () => {
  const notify = { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  let bank: string;

  const input = (overrides: Partial<RecurringRuleInput> = {}): RecurringRuleInput => ({
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
    dayOfMonth: 5,
    startDate: '2026-10-05',
    endType: 'never',
    endDate: null,
    maxCount: null,
    mode: 'auto',
    ...overrides,
  });

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
        { provide: NotificationService, useValue: notify },
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

  async function setup() {
    const fixture = TestBed.createComponent(RecurringPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const card = (title: string) =>
      [...el.querySelectorAll('l-card')].find((c) => textOf(c).startsWith(title));
    const button = (root: Element, label: string) =>
      [...root.querySelectorAll<HTMLButtonElement>('l-button button')].find(
        (b) => textOf(b) === label,
      )!;
    return { fixture, el, card, button };
  }

  it('offers the first rule when there are none', async () => {
    const actions = TestBed.inject(RecurringActions);
    const create = vi.spyOn(actions, 'create').mockReturnValue(of(undefined));
    const { el, button } = await setup();
    expect(textOf(el)).toContain('No recurring entries yet');
    button(el, 'Add rule').click();
    expect(create).toHaveBeenCalled();
  });

  it('lists active rules with their schedule, amount and next date, then paused and ended ones', async () => {
    const store = TestBed.inject(RecurringStore);
    store.create(input());
    const paused = store.create(input({ template: { ...input().template, payee: 'Gym' } }));
    store.create(
      input({
        template: { ...input().template, payee: 'Old' },
        endType: 'until',
        endDate: '2026-10-01',
      }),
    );
    TestBed.tick();
    store.setActive(store.byId(paused)!.rule, false);
    const { fixture, card } = await setup();
    fixture.detectChanges();

    expect(textOf(card('Active')!)).toBe(
      'Active Landlord Every month on the 5th · Bank Expense -$800.00 Next Oct 5 Actions for Landlord',
    );
    expect(textOf(fixture.nativeElement)).toContain('Paused (1)');
    expect(textOf(fixture.nativeElement)).toContain('Ended (1)');
  });

  it('confirms the oldest waiting entry of an ask-first rule (REC-04)', async () => {
    const store = TestBed.inject(RecurringStore);
    const id = store.create(input({ mode: 'confirm', startDate: '2026-08-05' }));
    const { fixture, card, button } = await setup();
    const waiting = card('Waiting for you')!;
    expect(textOf(waiting)).toContain('Landlord Due Wed, Aug 5, 2026 · Bank · then 1 entry more');

    button(waiting, 'Confirm').click();
    await vi.waitFor(() => expect(notify.success).toHaveBeenCalled());
    fixture.detectChanges();
    const txs = await firstValueFrom(
      TestBed.inject(TransactionsRepo).watchRange({ start: '2026-08-01', end: '2026-09-30' }),
    );
    expect(txs.map((t) => [t.id, t.date, t.amount, t.source])).toEqual([
      [`${id}_20260805`, '2026-08-05', 80000, 'recurring'],
    ]);
    expect(notify.success).toHaveBeenCalledWith('Entry added', 'Landlord · -$800.00');
    expect(textOf(card('Waiting for you')!)).toContain('Due Sat, Sep 5, 2026 · Bank');
  });

  it('skips a waiting entry with Undo', async () => {
    const store = TestBed.inject(RecurringStore);
    const id = store.create(input({ mode: 'confirm', startDate: '2026-09-05' }));
    const { fixture, card, button } = await setup();
    button(card('Waiting for you')!, 'Skip').click();
    await vi.waitFor(() => expect(notify.info).toHaveBeenCalled());
    fixture.detectChanges();
    expect(store.byId(id)!.rule.nextDueDate).toBe('2026-10-05');
    expect(card('Waiting for you')).toBeUndefined();

    const [title, message, options] = notify.info.mock.calls[0];
    expect([title, message]).toEqual(['Entry skipped', 'Landlord · Sat, Sep 5, 2026']);
    options.action.handler();
    TestBed.tick();
    expect(store.byId(id)!.rule.nextDueDate).toBe('2026-09-05');
  });
});
