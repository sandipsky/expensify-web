import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { parseISO } from 'date-fns';
import { scheduleAfter, templateOf } from '../../../core/domain/recurrence';
import { Preferences } from '../../../core/preferences';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { MODAL_DATA, ModalRef } from '../../../shared/components/ui/modal';
import { NotificationService } from '../../../shared/components/ui/notification';
import { AccountsStore } from '../../accounts/accounts.store';
import { CategoriesStore } from '../../categories/categories.store';
import { RecurringStore } from '../recurring.store';
import { RuleForm, RuleFormData } from './rule-form';

describe('RuleForm', () => {
  const close = vi.fn();
  let data: RuleFormData = {};
  let bank: string;

  beforeAll(() => {
    // jsdom lacks it; opening an l-select calls it.
    Element.prototype.scrollIntoView = () => {};
  });

  beforeEach(() => {
    localStorage.clear();
    close.mockReset();
    data = {};
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 27, 10));
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
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
        { provide: ModalRef, useValue: { close } },
        { provide: MODAL_DATA, useFactory: () => data },
        { provide: NotificationService, useValue: { success: vi.fn() } },
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

  async function setup(formData: RuleFormData = {}) {
    data = formData;
    const fixture = TestBed.createComponent(RuleForm);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const form = fixture.componentInstance['form'];
    const set = (patch: Partial<typeof form.value>) => {
      form.patchValue(patch);
      fixture.detectChanges();
    };
    const click = (label: string) => {
      const buttons = [...el.querySelectorAll<HTMLButtonElement>('l-button button')];
      buttons.find((b) => b.textContent?.trim() === label)!.click();
      fixture.detectChanges();
    };
    const text = (selector: string) =>
      el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const store = TestBed.inject(RecurringStore);
    return { fixture, el, form, set, click, text, store };
  }

  it('adds a monthly rule from today on the same day, in minor units (REC-01, REC-02)', async () => {
    const { set, click, text, store } = await setup();
    expect(text('h2')).toBe('Add recurring rule');
    expect(text('.rule-form__preview')).toBe(
      'Next: Sun, Sep 27, 2026 · Tue, Oct 27, 2026 · Fri, Nov 27, 2026',
    );

    set({ amount: 12.5, categoryId: 'exp_housing', payee: '  Landlord ' });
    click('Add rule');

    const [view] = store.views();
    expect(view.rule).toMatchObject({
      template: {
        type: 'expense',
        amount: 1250,
        accountId: bank,
        categoryId: 'exp_housing',
        payee: 'Landlord',
      },
      frequency: 'monthly',
      interval: 1,
      dayOfMonth: 27,
      weekdays: [],
      startDate: '2026-09-27',
      nextDueDate: '2026-09-27',
      endType: 'never',
      mode: 'auto',
    });
    expect(close).toHaveBeenCalledWith(view.id);
  });

  it('needs an amount and a category, and a second account for transfers', async () => {
    const { form, set, click, store } = await setup();
    click('Add rule');
    expect(store.views()).toEqual([]);
    expect(form.controls.categoryId.hasError('required')).toBe(true);

    set({ type: 'transfer', amount: 10, toAccountId: bank });
    expect(form.controls.categoryId.valid).toBe(true);
    expect(form.controls.toAccountId.hasError('sameAccount')).toBe(true);
  });

  it('asks for weekdays on weekly rules and follows the start date until picked', async () => {
    const { form, set, text } = await setup();
    set({ frequency: 'weekly' });
    // Sunday 27 Sep.
    expect(form.controls.weekdays.value).toEqual([7]);
    set({ startDate: parseISO('2026-10-01') });
    expect(form.controls.weekdays.value).toEqual([4]);
    expect(form.controls.dayOfMonth.value).toBe(1);

    set({ weekdays: [] });
    expect(form.controls.weekdays.hasError('required')).toBe(true);
    set({ weekdays: [1, 5], interval: 2 });
    expect(text('.rule-form__preview')).toBe(
      'Next: Fri, Oct 2, 2026 · Mon, Oct 12, 2026 · Fri, Oct 16, 2026',
    );
  });

  it('ends after a count or on a date on or after the start (REC-03)', async () => {
    const { form, set, text } = await setup();
    set({ endType: 'count' });
    expect(form.controls.maxCount.value).toBe(12);
    set({ maxCount: 2 });
    expect(text('.rule-form__preview')).toBe('Next: Sun, Sep 27, 2026 · Tue, Oct 27, 2026');

    set({ endType: 'until', endDate: parseISO('2026-09-01') });
    expect(form.controls.endDate.hasError('beforeStart')).toBe(true);
    set({ endDate: parseISO('2026-09-26') });
    expect(text('.rule-form__preview')).toBe('This rule ends before its next entry.');
  });

  it('says how many past entries a start in the past catches up (REC-06)', async () => {
    const { set, el } = await setup();
    const hint = () =>
      [...el.querySelectorAll('.sheet-form__hint')].map((h) => h.textContent!.trim());
    set({ startDate: parseISO('2026-07-15') });
    expect(hint()).toContain('3 entries dated up to today will be added when you save.');
    set({ mode: 'confirm' });
    expect(hint()).toContain(
      '3 entries dated up to today will wait for you to confirm or skip them.',
    );
  });

  it('makes an entry recurring from one period after it, whatever the frequency (REC-01)', async () => {
    const tx = {
      type: 'expense' as const,
      amount: 1499,
      accountId: bank,
      toAccountId: null,
      categoryId: 'exp_entertainment',
      payee: 'Netflix',
      note: null,
      tags: ['tv'],
    };
    const { form, set, click, store } = await setup({
      prefill: { template: templateOf(tx), ...scheduleAfter('2026-09-15', 'monthly') },
      fromDate: '2026-09-15',
    });
    expect(form.controls.startDate.value).toEqual(parseISO('2026-10-15'));
    expect(form.controls.amount.value).toBe(14.99);

    set({ frequency: 'weekly' });
    expect(form.controls.startDate.value).toEqual(parseISO('2026-09-22'));
    // 15 Sep 2026 was a Tuesday.
    expect(form.controls.weekdays.value).toEqual([2]);
    set({ frequency: 'monthly' });
    click('Add rule');
    expect(store.views()[0].rule).toMatchObject({
      template: { payee: 'Netflix', tags: ['tv'], amount: 1499 },
      dayOfMonth: 15,
      startDate: '2026-10-15',
      nextDueDate: '2026-10-15',
    });
  });

  it('edits a rule, moving its next date only when the schedule changes (REC-07)', async () => {
    const recurring = TestBed.inject(RecurringStore);
    const id = recurring.create({
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
    });
    TestBed.tick();
    const { set, click, text, store } = await setup({ rule: recurring.byId(id)!.rule });
    expect(text('h2')).toBe('Edit recurring rule');
    expect(text('.alert')).toContain('Changes apply to entries from now on.');

    set({ amount: 3100 });
    click('Save');
    TestBed.tick();
    expect(store.byId(id)!.rule).toMatchObject({
      nextDueDate: '2026-10-01',
      template: { amount: 310000 },
    });
    expect(close).toHaveBeenCalledWith(id);
  });
});
