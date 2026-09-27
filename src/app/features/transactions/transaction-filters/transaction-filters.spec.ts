import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NO_FILTER } from '../../../core/domain/transactions';
import { Preferences } from '../../../core/preferences';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { MODAL_DATA, ModalRef } from '../../../shared/components/ui/modal';
import { CategoriesStore } from '../../categories/categories.store';
import { TransactionFilters, TransactionFiltersData } from './transaction-filters';

describe('TransactionFilters', () => {
  const close = vi.fn();

  async function setup(data: Partial<TransactionFiltersData> = {}) {
    localStorage.clear();
    close.mockReset();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Preferences,
          useValue: { locale: signal('en-US'), baseCurrency: signal('USD') },
        },
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
        { provide: ModalRef, useValue: { close } },
        {
          provide: MODAL_DATA,
          useValue: {
            filter: { ...NO_FILTER, search: 'kept' },
            tags: [],
            currency: 'USD',
            ...data,
          },
        },
      ],
    });
    TestBed.inject(CategoriesStore).seedDefaults();
    const fixture = TestBed.createComponent(TransactionFilters);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    const apply = () => component['apply']();
    return { fixture, form: component['form'], categories: component['categoryItems'], apply };
  }

  it('offers the categories of the chosen type, and drops the rest on a switch', async () => {
    const { form, categories, apply } = await setup();
    const groups = () => [...new Set(categories().map((c) => c.group))];
    expect(groups()).toEqual(['Expense', 'Income']);
    expect(categories().some((c) => c.value === 'exp_adjustment')).toBe(false);

    form.controls.categoryIds.setValue(['exp_food', 'inc_salary']);
    form.controls.type.setValue('income');
    expect(groups()).toEqual(['Income']);
    expect(form.controls.categoryIds.value).toEqual(['inc_salary']);

    form.controls.type.setValue('transfer');
    expect(categories()).toEqual([]);
    apply();
    expect(close.mock.lastCall![0]).toMatchObject({ type: 'transfer', categoryIds: [] });
  });

  it('applies amounts in minor units, in order, and keeps the search (LST-07)', async () => {
    const { form, apply } = await setup();
    form.controls.min.setValue(50);
    form.controls.max.setValue(12.5);
    apply();
    expect(close).toHaveBeenCalledWith({
      ...NO_FILTER,
      search: 'kept',
      minAmount: 1250,
      maxAmount: 5000,
    });
  });

  it('starts from the current filter and clears it all', async () => {
    const { form, fixture } = await setup({
      filter: { ...NO_FILTER, type: 'expense', tags: ['home'], minAmount: 999 },
      tags: ['home', 'work'],
    });
    expect(form.getRawValue()).toMatchObject({ type: 'expense', tags: ['home'], min: 9.99 });
    fixture.componentInstance['reset']();
    expect(form.getRawValue()).toEqual({
      type: 'all',
      accountIds: [],
      categoryIds: [],
      tags: [],
      min: null,
      max: null,
    });
  });
});
