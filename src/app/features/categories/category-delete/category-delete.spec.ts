import { TestBed } from '@angular/core/testing';
import { Budget } from '../../../core/models/budget';
import { CategoryInput } from '../../../core/models/category';
import { Transaction } from '../../../core/models/transaction';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { MODAL_DATA, ModalRef } from '../../../shared/components/ui/modal';
import { CategoriesStore } from '../categories.store';
import { CategoryDelete, CategoryDeleteData } from './category-delete';

const input = (overrides: Partial<CategoryInput> = {}): CategoryInput => ({
  name: 'Food',
  parentId: null,
  icon: 'restaurant',
  color: '#EA580C',
  ...overrides,
});

describe('CategoryDelete', () => {
  const close = vi.fn();

  async function setup(counts: { transactions: number; budgets: number; subs?: number }) {
    TestBed.configureTestingModule({
      providers: [
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
        { provide: ModalRef, useValue: { close } },
        {
          provide: MODAL_DATA,
          useFactory: (): CategoryDeleteData => {
            const store = TestBed.inject(CategoriesStore);
            const food = store.byId(store.create('expense', input()))!;
            for (let i = 0; i < (counts.subs ?? 0); i++) {
              store.create('expense', input({ name: `Sub ${i}`, parentId: food.id }));
            }
            store.create('expense', input({ name: 'Rent' }));
            return {
              category: food,
              usage: {
                categories: [food, ...store.subcategories(food)],
                transactions: Array.from(
                  { length: counts.transactions },
                  () => ({}) as Transaction,
                ),
                budgets: Array.from({ length: counts.budgets }, () => ({}) as Budget),
                rules: [],
              },
            };
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(CategoryDelete);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const click = (label: string) => {
      const buttons = [...el.querySelectorAll<HTMLButtonElement>('l-button button')];
      buttons.find((b) => b.textContent?.trim() === label)!.click();
      fixture.detectChanges();
    };
    return { fixture, el, click, component: fixture.componentInstance };
  }

  beforeEach(() => {
    localStorage.clear();
    close.mockReset();
  });

  it('says what uses the category and defaults the move to Uncategorized (CAT-06)', async () => {
    const { el, click, component } = await setup({ transactions: 12, budgets: 1, subs: 2 });
    expect(el.querySelector('h2')!.textContent).toBe('Delete Food?');
    expect(el.querySelector('.sheet-form__intro')!.textContent).toBe(
      '12 transactions and 1 budget use Food and its 2 subcategories. Choose where they go, then delete.',
    );
    expect(component['items'].map((i) => i.label)).toEqual(['Rent', 'Uncategorized']);

    click('Move and delete');
    expect(close).toHaveBeenCalledWith('exp_uncategorized');
  });

  it('reads well for a single use', async () => {
    const { el } = await setup({ transactions: 1, budgets: 0 });
    expect(el.querySelector('.sheet-form__intro')!.textContent).toBe(
      '1 transaction uses Food. Choose where it goes, then delete.',
    );
  });

  it('closes with nothing when cancelled', async () => {
    const { click } = await setup({ transactions: 3, budgets: 0 });
    click('Cancel');
    expect(close).toHaveBeenCalledWith(undefined);
  });
});
