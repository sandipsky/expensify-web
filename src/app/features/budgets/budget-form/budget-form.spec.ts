import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Budget, BudgetPeriod } from '../../../core/models/budget';
import { Preferences } from '../../../core/preferences';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { MODAL_DATA, ModalRef } from '../../../shared/components/ui/modal';
import { NotificationService } from '../../../shared/components/ui/notification';
import { CategoriesStore } from '../../categories/categories.store';
import { suggestBudgetName } from '../budget-labels';
import { BudgetsStore } from '../budgets.store';
import { BudgetForm, BudgetFormData } from './budget-form';

describe('BudgetForm', () => {
  const close = vi.fn();
  let data: BudgetFormData = {};

  beforeEach(() => {
    localStorage.clear();
    close.mockReset();
    data = {};
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 26, 10));
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
  });

  afterEach(() => vi.useRealTimers());

  async function setup(formData: BudgetFormData = {}) {
    data = formData;
    const fixture = TestBed.createComponent(BudgetForm);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const form = fixture.componentInstance['form'];
    const type = (selector: string, text: string) => {
      const input = el.querySelector<HTMLInputElement>(selector)!;
      input.value = text;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const set = (patch: Partial<typeof form.value> & { period?: BudgetPeriod }) => {
      form.patchValue(patch);
      fixture.detectChanges();
    };
    const click = (label: string) => {
      const buttons = [...el.querySelectorAll<HTMLButtonElement>('l-button button')];
      buttons.find((b) => b.textContent?.trim() === label)!.click();
      fixture.detectChanges();
    };
    const hints = () =>
      [...el.querySelectorAll('.sheet-form__hint')].map((h) => h.textContent!.trim());
    return { fixture, el, form, type, set, click, hints, store: TestBed.inject(BudgetsStore) };
  }

  it('adds a monthly budget for every expense, in minor units (BUD-01)', async () => {
    const { el, type, click, store } = await setup();
    expect(el.querySelector('h2')!.textContent).toBe('Add budget');

    type('l-number-input input', '500.5');
    click('Add budget');

    const [budget] = store.all();
    expect(budget).toMatchObject({
      name: 'All expenses',
      amount: 50050,
      period: 'monthly',
      categoryIds: [],
      rollover: false,
      alertThresholds: [80, 100],
      active: true,
    });
    expect(close).toHaveBeenCalledWith(budget.id);
  });

  it('needs a limit above zero', async () => {
    const { type, click, store } = await setup();
    click('Add budget');
    type('l-number-input input', '0');
    click('Add budget');
    expect(store.all()).toEqual([]);
    expect(close).not.toHaveBeenCalled();
  });

  it('names a new budget after its categories until the user types a name', async () => {
    const { form, set, type } = await setup();
    set({ categoryIds: ['exp_food'] });
    expect(form.controls.name.value).toBe('Food and dining');
    set({ categoryIds: ['exp_food', 'exp_transport'] });
    expect(form.controls.name.value).toBe('Food and dining & Transport');

    type('l-text-input input', 'Eating');
    set({ categoryIds: ['exp_transport'] });
    expect(form.controls.name.value).toBe('Eating');
  });

  it('shows the period each type covers today (BR-05, BUD-08)', async () => {
    const { el, set, hints } = await setup();
    expect(hints()[0]).toBe('This period: September 2026');

    set({ period: 'weekly' });
    expect(hints()[0]).toMatch(/^This period: Sep 21\s–\s27, 2026$/);
    expect(el.querySelector('l-number-input label')!.textContent).toContain('Weekly limit');
    expect(hints()).toContain(
      "Adds what's left from last week to this one, or takes an overspend off it.",
    );
  });

  it('saves rollover, alerts and a yearly period (BUD-06, BUD-07, BUD-08)', async () => {
    const { type, set, click, store } = await setup();
    type('l-number-input input', '6000');
    set({ period: 'yearly', rollover: true, alerts: false });
    click('Add budget');

    expect(store.all()[0]).toMatchObject({
      amount: 600000,
      period: 'yearly',
      rollover: true,
      alertThresholds: [],
    });
  });

  it('edits a budget and keeps an archived category it counts', async () => {
    const store = TestBed.inject(BudgetsStore);
    const categories = TestBed.inject(CategoriesStore);
    const id = store.create({
      name: 'Food',
      amount: 50000,
      period: 'monthly',
      categoryIds: ['exp_food'],
      rollover: false,
      alerts: true,
    });
    categories.setArchived(categories.byId('exp_food')!, true);
    const budget: Budget = store.byId(id)!;

    const { el, fixture, form, type, click } = await setup({ budget });
    expect(el.querySelector('h2')!.textContent).toBe('Edit budget');
    expect(form.controls.amount.value).toBe(500);
    const items = fixture.componentInstance['categoryItems'];
    expect(items.find((i) => i.value === 'exp_food')?.label).toBe('Food and dining (archived)');

    type('l-number-input input', '650');
    click('Save');
    expect(store.byId(id)).toMatchObject({
      name: 'Food',
      amount: 65000,
      categoryIds: ['exp_food'],
    });
    expect(close).toHaveBeenCalledWith(id);
  });

  it('suggests names that fit', () => {
    expect(suggestBudgetName([])).toBe('All expenses');
    expect(suggestBudgetName(['Food', 'Transport', 'Health'])).toBe('Food & 2 more');
    expect(suggestBudgetName(['A'.repeat(50)])).toHaveLength(40);
  });
});
