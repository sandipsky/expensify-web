import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Account, AccountInput } from '../../../core/models/account';
import { Preferences } from '../../../core/preferences';
import { DRAWER_DATA, DrawerRef } from '../../../shared/components/ui/drawer';
import { NotificationService } from '../../../shared/components/ui/notification';
import { TransactionsRepo } from '../../../core/data/transactions.repo';
import { AccountsStore } from '../accounts.store';
import { ReconcileForm } from './reconcile-form';

describe('ReconcileForm (ACC-07)', () => {
  const close = vi.fn();
  const notify = { success: vi.fn(), info: vi.fn() };

  async function setup(account: Partial<AccountInput>) {
    localStorage.clear();
    const data: { account?: Account } = {};
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Preferences,
          useValue: { locale: signal('en-US'), baseCurrency: signal('USD') },
        },
        // Opened as a phone bottom sheet this time, to cover the drawer path of injectSheet().
        { provide: DrawerRef, useValue: { close } },
        { provide: DRAWER_DATA, useValue: data },
        { provide: NotificationService, useValue: notify },
      ],
    });
    const store = TestBed.inject(AccountsStore);
    const id = store.create({
      name: 'Bank',
      type: 'bank',
      openingBalance: 10000,
      creditLimit: null,
      includeInTotal: true,
      ...account,
    });
    data.account = store.byId(id);
    const fixture = TestBed.createComponent(ReconcileForm);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('l-number-input input')!;
    const type = (text: string) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const save = () => {
      [...el.querySelectorAll<HTMLButtonElement>('l-button button')]
        .find((b) => b.textContent?.trim() === 'Save')!
        .click();
    };
    const summary = () =>
      [...el.querySelectorAll('.reconcile-summary dd')].map((d) =>
        d.textContent?.replace(/\s+/g, ' ').trim(),
      );
    return { el, input, type, save, summary, store, id };
  }

  beforeEach(() => vi.clearAllMocks());

  it('starts from the balance in the app and previews the adjustment', async () => {
    const { input, type, summary } = await setup({});
    expect(input.value).toBe('100.00');
    expect(summary()).toEqual(['$100.00', 'None, it already matches']);

    type('125.50');
    expect(summary()).toEqual(['$100.00', '+$25.50']);
  });

  it('records the difference as a balance adjustment', async () => {
    const { type, save, store, id } = await setup({});
    type('92');
    save();

    expect(store.byId(id)!.currentBalance).toBe(9200);
    const [tx] = await TestBed.inject(TransactionsRepo).listByAccount(id);
    expect(tx).toMatchObject({ type: 'expense', amount: 800, categoryId: 'exp_adjustment' });
    expect(notify.success).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it('works in amounts owed for cards', async () => {
    const { el, input, type, save, summary, store, id } = await setup({
      name: 'Visa',
      type: 'credit_card',
      openingBalance: -30000,
    });
    expect(el.querySelector('label')!.textContent).toBe('Actual amount owed *');
    expect(input.value).toBe('300.00');

    type('310');
    expect(summary()).toEqual(['$300.00 owed', '-$10.00']);
    save();
    expect(store.byId(id)!.currentBalance).toBe(-31000);
  });

  it('records nothing when the balance already matches', async () => {
    const { save, id } = await setup({});
    save();
    expect(await TestBed.inject(TransactionsRepo).listByAccount(id)).toEqual([]);
    expect(notify.info).toHaveBeenCalledWith('Already matches', expect.any(String));
    expect(close).toHaveBeenCalled();
  });
});
