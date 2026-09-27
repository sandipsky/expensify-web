import { TestBed } from '@angular/core/testing';
import { CategoryInput } from '../../../core/models/category';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { MODAL_DATA, ModalRef } from '../../../shared/components/ui/modal';
import { NotificationService } from '../../../shared/components/ui/notification';
import { CategoriesStore } from '../categories.store';
import { CategoryForm, CategoryFormData } from './category-form';

const input = (overrides: Partial<CategoryInput> = {}): CategoryInput => ({
  name: 'Food',
  parentId: null,
  icon: 'restaurant',
  color: '#EA580C',
  ...overrides,
});

describe('CategoryForm', () => {
  const close = vi.fn();

  async function setup(
    data: CategoryFormData | ((store: CategoriesStore) => CategoryFormData) = {},
  ) {
    TestBed.configureTestingModule({
      providers: [
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
        { provide: ModalRef, useValue: { close } },
        {
          provide: MODAL_DATA,
          useFactory: () =>
            typeof data === 'function' ? data(TestBed.inject(CategoriesStore)) : data,
        },
        { provide: NotificationService, useValue: { success: vi.fn() } },
      ],
    });
    const store = TestBed.inject(CategoriesStore);
    const fixture = TestBed.createComponent(CategoryForm);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const form = () => fixture.componentInstance['form'];
    const typeName = (text: string) => {
      const field = el.querySelector<HTMLInputElement>('l-text-input input')!;
      field.value = text;
      field.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const click = (label: string) => {
      const buttons = [...el.querySelectorAll<HTMLButtonElement>('l-button button')];
      buttons.find((b) => b.textContent?.trim() === label)!.click();
      fixture.detectChanges();
    };
    const error = () => el.querySelector('l-text-input .alert.error')?.textContent?.trim();
    return { fixture, el, store, form, typeName, click, error };
  }

  beforeEach(() => {
    localStorage.clear();
    close.mockReset();
  });

  it('adds a category of the chosen type with its color and icon (CAT-01, CAT-02)', async () => {
    const { el, store, form, typeName, click } = await setup({ type: 'income' });
    expect(el.querySelector('h2')!.textContent).toBe('Add category');
    expect(el.querySelector('l-segmented-control')).not.toBeNull();
    expect(form().controls.type.value).toBe('income');

    typeName(' Side job ');
    el.querySelector<HTMLInputElement>('l-color-picker input[aria-label="Teal"]')!.click();
    el.querySelector<HTMLInputElement>('l-icon-picker input[aria-label="work"]')!.click();
    click('Add category');

    const created = store.all().find((c) => !c.isSystem)!;
    expect(created).toMatchObject({
      name: 'Side job',
      type: 'income',
      parentId: null,
      color: '#0D9488',
      icon: 'work',
    });
    expect(close).toHaveBeenCalledWith(created.id);
  });

  it('refuses a name already used in the same list, ignoring case (CAT-04)', async () => {
    const { store, typeName, click, error } = await setup((store) => {
      store.create('expense', input());
      return { type: 'expense' };
    });

    typeName('FOOD');
    click('Add category');
    expect(error()).toBe('You already have an expense category with this name.');
    expect(close).not.toHaveBeenCalled();
    expect(store.all().filter((c) => c.name.toLowerCase() === 'food')).toHaveLength(1);
  });

  it('checks the name again when the type changes', async () => {
    const { fixture, form, typeName, error } = await setup((store) => {
      store.create('income', input({ name: 'Bonus' }));
      return { type: 'expense' };
    });
    typeName('bonus');
    expect(error()).toBeUndefined();

    form().controls.type.setValue('income');
    fixture.detectChanges();
    expect(error()).toBe('You already have an income category with this name.');
  });

  it("adds a subcategory under its parent, in the parent's look (CAT-07)", async () => {
    let parentId = '';
    const { el, store, form, typeName, click, error } = await setup((store) => {
      parentId = store.create('expense', input());
      store.create('expense', input({ name: 'Coffee', parentId }));
      return { type: 'expense', parentId };
    });
    expect(el.querySelector('h2')!.textContent).toBe('Add subcategory');
    expect(el.querySelector('l-segmented-control')).toBeNull();
    expect(form().getRawValue()).toMatchObject({ parentId, icon: 'restaurant', color: '#EA580C' });

    typeName('coffee');
    click('Add subcategory');
    expect(error()).toBe('Food already has a subcategory with this name.');

    typeName('Takeaway');
    click('Add subcategory');
    expect(store.all().find((c) => c.name === 'Takeaway')).toMatchObject({ parentId });
  });

  it('edits a category, keeping its type (CAT-02)', async () => {
    const { el, store, typeName, click } = await setup((store) => ({
      category: store.byId(store.create('expense', input()))!,
    }));
    expect(el.querySelector('h2')!.textContent).toBe('Edit category');
    expect(el.querySelector('l-segmented-control')).toBeNull();
    expect(
      el.querySelector<HTMLInputElement>('l-icon-picker input[aria-label="restaurant"]')!.checked,
    ).toBe(true);

    typeName('Eating out');
    click('Save');
    expect(store.all().find((c) => !c.isSystem)).toMatchObject({
      name: 'Eating out',
      type: 'expense',
    });
  });

  it('keeps a parent with subcategories at the top level', async () => {
    const { el } = await setup((store) => {
      const food = store.create('expense', input());
      store.create('expense', input({ name: 'Coffee', parentId: food }));
      store.create('expense', input({ name: 'Rent' }));
      return { category: store.byId(food)! };
    });
    expect(el.querySelector('l-select')).toBeNull();
    expect(el.textContent).toContain('It has subcategories, so it stays at the top level.');
  });

  it('keeps a color and icon set elsewhere selectable', async () => {
    const { el } = await setup((store) => ({
      category: store.byId(store.create('expense', input({ color: '#123456', icon: 'pets' })))!,
    }));
    expect(
      el.querySelector<HTMLInputElement>('l-color-picker input[aria-label="Current color"]')!
        .checked,
    ).toBe(true);
  });

  it('requires a name', async () => {
    const { click, error } = await setup({ type: 'expense' });
    click('Add category');
    expect(error()).toBe('This field is required.');
    expect(close).not.toHaveBeenCalled();
  });
});
