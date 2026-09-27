import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AccountInput } from '../../../core/models/account';
import { Preferences } from '../../../core/preferences';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { AccountActions } from '../account-actions';
import { AccountsStore } from '../accounts.store';
import { AccountsPage } from './accounts-page';

const input = (overrides: Partial<AccountInput> = {}): AccountInput => ({
  name: 'Cash',
  type: 'cash',
  openingBalance: 0,
  creditLimit: null,
  includeInTotal: true,
  ...overrides,
});

describe('AccountsPage', () => {
  const actions = {
    create: vi.fn(() => of(undefined)),
    edit: vi.fn(),
    reconcile: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    delete: vi.fn(),
  };

  async function setup(seed: (store: AccountsStore) => void = () => {}) {
    localStorage.clear();
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Preferences,
          useValue: { locale: signal('en-US'), baseCurrency: signal('USD') },
        },
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
        { provide: AccountActions, useValue: actions },
      ],
    });
    seed(TestBed.inject(AccountsStore));
    const fixture = TestBed.createComponent(AccountsPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const text = (selector: string) => el.querySelector(selector)?.textContent?.trim();
    const names = (selector: string) =>
      [...el.querySelectorAll(`${selector} .account-card__link`)].map((a) => a.textContent?.trim());
    const button = (label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('l-button button')].find(
        (b) => b.textContent?.trim() === label,
      );
    return { el, text, names, button };
  }

  it('invites the user to add a first account', async () => {
    const { text, button } = await setup();
    expect(text('app-empty-state .empty-state__title')).toBe('No accounts yet');
    button('Add account')!.click();
    expect(actions.create).toHaveBeenCalled();
  });

  it('shows the total of included accounts and each active account (ACC-02)', async () => {
    const { el, text, names } = await setup((store) => {
      store.create(input({ name: 'Cash', openingBalance: 5000 }));
      store.create(input({ name: 'Bank', type: 'bank', openingBalance: 100000 }));
      store.create(input({ name: 'Visa', type: 'credit_card', openingBalance: -2000 }));
      store.create(input({ name: 'Savings', openingBalance: 90000, includeInTotal: false }));
    });
    expect(text('.accounts-total__amount')).toBe('$1,030.00');
    expect(text('.accounts-total__note')).toBe('Across 3 accounts · 1 not included');
    expect(names('l-row')).toEqual(['Cash', 'Bank', 'Visa', 'Savings']);
    expect(el.querySelector('l-accordion')).toBeNull();
  });

  it('moves archived accounts into their own section, out of the total (ACC-04)', async () => {
    const { text, names } = await setup((store) => {
      store.create(input({ name: 'Cash', openingBalance: 5000 }));
      const old = store.create(input({ name: 'Old wallet', openingBalance: 700 }));
      store.setArchived(store.byId(old)!, true);
    });
    expect(text('.accounts-total__amount')).toBe('$50.00');
    expect(text('.l-accordion-item__title')).toBe('Archived (1)');
    expect(names('l-accordion')).toEqual(['Old wallet']);
  });

  it('offers to add an account when every account is archived', async () => {
    const { text, button } = await setup((store) => {
      store.setArchived(store.byId(store.create(input()))!, true);
    });
    expect(text('app-empty-state .empty-state__title')).toBe('All your accounts are archived');
    button('Add account')!.click();
    expect(actions.create).toHaveBeenCalled();
  });
});
