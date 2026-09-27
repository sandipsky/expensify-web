import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CategoryInput } from '../../../core/models/category';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { CategoriesStore } from '../categories.store';
import { CategoryActions } from '../category-actions';
import { CategoriesPage } from './categories-page';

const input = (overrides: Partial<CategoryInput> = {}): CategoryInput => ({
  name: 'Food',
  parentId: null,
  icon: 'restaurant',
  color: '#EA580C',
  ...overrides,
});

describe('CategoriesPage', () => {
  const actions = {
    create: vi.fn(() => of(undefined)),
    edit: vi.fn(),
    seedDefaults: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    delete: vi.fn(),
  };

  async function setup(seed: (store: CategoriesStore) => void = () => {}) {
    localStorage.clear();
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
        { provide: CategoryActions, useValue: actions },
      ],
    });
    const store = TestBed.inject(CategoriesStore);
    seed(store);
    const fixture = TestBed.createComponent(CategoriesPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const panel = (index: number) => el.querySelectorAll<HTMLElement>('.l-tab__panel')[index];
    const names = (root: ParentNode) =>
      [...root.querySelectorAll('.category-row__name')].map((n) =>
        n.textContent?.replace('Edit', '').trim(),
      );
    const button = (label: string, root: ParentNode = el) =>
      [...root.querySelectorAll<HTMLButtonElement>('l-button button')].find(
        (b) => b.textContent?.trim() === label,
      );
    return { fixture, el, store, panel, names, button };
  }

  it('offers the default categories to an empty list', async () => {
    const { el, button } = await setup();
    expect(el.querySelector('.empty-state__title')!.textContent).toBe('No categories yet');

    button('Add default categories')!.click();
    expect(actions.seedDefaults).toHaveBeenCalled();
    button('Add category')!.click();
    expect(actions.create).toHaveBeenCalledWith('expense');
  });

  it('lists expense and income categories on their own tabs (CAT-01)', async () => {
    const { el, panel, names } = await setup((store) => store.seedDefaults());
    const tabs = [...el.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim());
    expect(tabs).toEqual(['Expense', 'Income']);
    expect(names(panel(0).querySelector('l-card')!)).toContain('Food and dining');
    expect(names(panel(1).querySelector('l-card')!)).toContain('Salary');
    expect(panel(1).hidden).toBe(true);
  });

  it('adds to the open tab', async () => {
    const { fixture, el, button } = await setup((store) => store.seedDefaults());
    el.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
    fixture.detectChanges();
    button('Add category')!.click();
    expect(actions.create).toHaveBeenCalledWith('income');
  });

  it('nests subcategories under their parent and offers to add more (CAT-07)', async () => {
    const { el, fixture, store } = await setup((store) => {
      const food = store.create('expense', input());
      store.create('expense', input({ name: 'Coffee', parentId: food }));
    });
    const [parent, child] = [...el.querySelectorAll('app-category-row')];
    expect(parent.querySelector('.category-row__caption')!.textContent).toBe('1 subcategory');
    expect(child.classList.contains('is-nested')).toBe(true);

    parent.querySelector<HTMLButtonElement>('.category-row__edit')!.click();
    expect(actions.edit).toHaveBeenCalledWith(
      store.byId(store.lists().expense.tree[0].category.id),
    );

    parent.querySelector<HTMLButtonElement>('[dropdown-display] button')!.click();
    fixture.detectChanges();
    const addSub = [...document.querySelectorAll<HTMLButtonElement>('[dropdown-item]')].find((b) =>
      b.textContent?.includes('Add subcategory'),
    )!;
    addSub.click();
    expect(actions.create).toHaveBeenCalledWith(
      'expense',
      store.lists().expense.tree[0].category.id,
    );
  });

  it('shows system categories locked, with what they are for (CAT-05)', async () => {
    const { panel, names } = await setup((store) => store.create('expense', input()));
    const system = [...panel(0).querySelectorAll('l-card')].find((c) =>
      c.textContent?.includes('System categories'),
    )!;
    expect(names(system)).toEqual(['Uncategorized', 'Balance adjustment']);
    expect(system.querySelectorAll('.category-row__lock')).toHaveLength(2);
    expect(system.querySelector('l-menu')).toBeNull();
    expect(system.textContent).toContain('left out of reports and budgets');
  });

  it('keeps archived categories in their own section (CAT-03)', async () => {
    const { panel, names } = await setup((store) => {
      const food = store.create('expense', input());
      store.create('expense', input({ name: 'Rent' }));
      store.setArchived(store.byId(food)!, true);
    });
    const archived = panel(0).querySelector('l-accordion')!;
    expect(archived.textContent).toContain('Archived (1)');
    expect(names(archived)).toEqual(['Food']);
    expect(names(panel(0).querySelector('l-card')!)).toEqual(['Rent']);
  });

  it('invites a first category for a type that has none', async () => {
    const { panel, button } = await setup((store) => store.create('expense', input()));
    expect(panel(1).querySelector('.empty-state__title')!.textContent).toBe('No income categories');
    button('Add category', panel(1))!.click();
    expect(actions.create).toHaveBeenCalledWith('income');
  });
});
