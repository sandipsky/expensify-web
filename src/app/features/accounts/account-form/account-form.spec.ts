import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AccountType } from '../../../core/models/account';
import { Preferences } from '../../../core/preferences';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { MODAL_DATA, ModalRef } from '../../../shared/components/ui/modal';
import { NotificationService } from '../../../shared/components/ui/notification';
import { AccountsStore } from '../accounts.store';
import { AccountForm, AccountFormData } from './account-form';

describe('AccountForm', () => {
  const close = vi.fn();

  async function setup(data: AccountFormData = {}) {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Preferences,
          useValue: { locale: signal('en-US'), baseCurrency: signal('USD') },
        },
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
        { provide: ModalRef, useValue: { close } },
        { provide: MODAL_DATA, useValue: data },
        { provide: NotificationService, useValue: { success: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(AccountForm);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const type = (selector: string, text: string, index = 0) => {
      const input = el.querySelectorAll<HTMLInputElement>(selector)[index];
      input.value = text;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const setType = (value: AccountType) => {
      fixture.componentInstance['form'].controls.type.setValue(value);
      fixture.detectChanges();
    };
    const click = (label: string) => {
      const buttons = [...el.querySelectorAll<HTMLButtonElement>('l-button button')];
      buttons.find((b) => b.textContent?.trim() === label)!.click();
      fixture.detectChanges();
    };
    // Without the required asterisk that FormValidation appends.
    const amountLabels = () =>
      [...el.querySelectorAll('l-number-input label')].map((l) =>
        l.textContent?.replace('*', '').trim(),
      );
    return {
      fixture,
      el,
      type,
      setType,
      click,
      amountLabels,
      store: TestBed.inject(AccountsStore),
    };
  }

  beforeEach(() => {
    localStorage.clear();
    close.mockReset();
  });

  it('adds an account with its opening balance in minor units (ACC-01)', async () => {
    const { el, type, click, store } = await setup();
    expect(el.querySelector('h2')!.textContent).toBe('Add account');
    expect(el.querySelector('l-number-input .affix.prefix')!.textContent).toBe('$');

    type('l-text-input input', 'Everyday bank');
    type('l-number-input input', '1250.75');
    click('Add account');

    const [account] = store.all();
    expect(account).toMatchObject({
      name: 'Everyday bank',
      type: 'cash',
      openingBalance: 125075,
      currentBalance: 125075,
      includeInTotal: true,
    });
    expect(close).toHaveBeenCalledWith(account.id);
  });

  it('asks cards for the amount owed and an optional limit, storing a negative balance (ACC-08)', async () => {
    const { type, setType, click, amountLabels, store } = await setup();
    expect(amountLabels()).toEqual(['Opening balance']);

    setType('credit_card');
    expect(amountLabels()).toEqual(['Amount owed', 'Credit limit']);

    type('l-text-input input', 'Visa');
    type('l-number-input input', '320');
    type('l-number-input input', '1000', 1);
    click('Add account');

    expect(store.all()[0]).toMatchObject({
      type: 'credit_card',
      openingBalance: -32000,
      creditLimit: 100000,
      icon: 'credit_card',
    });
  });

  it('refuses an opening balance past the per-transaction maximum (BR-03)', async () => {
    const { el, type, click, store } = await setup();
    type('l-text-input input', 'Bank');
    type('l-number-input input', '1000000000');
    click('Add account');

    expect(store.all()).toEqual([]);
    expect(el.querySelector('l-number-input .alert.error')?.textContent).toBe(
      'Must be no more than 999999999.99.',
    );
  });

  it('refuses to save without a name', async () => {
    const { el, type, click, store } = await setup();
    type('l-text-input input', '   ');
    click('Add account');

    expect(store.all()).toEqual([]);
    expect(close).not.toHaveBeenCalled();
    expect(el.querySelector('l-text-input .alert.error')?.textContent).toBe(
      'This field is required.',
    );
  });

  it('edits an account, prefilled, and moves the current balance with the opening balance (ACC-03)', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Preferences,
          useValue: { locale: signal('en-US'), baseCurrency: signal('USD') },
        },
      ],
    });
    const seed = TestBed.inject(AccountsStore);
    const id = seed.create({
      name: 'Car loan',
      type: 'loan',
      openingBalance: -500000,
      creditLimit: null,
      includeInTotal: true,
    });
    seed.reconcile(seed.byId(id)!, -450000);
    const account = seed.byId(id)!;
    TestBed.resetTestingModule();

    const { el, type, click, amountLabels, store } = await setup({ account });
    expect(el.querySelector('h2')!.textContent).toBe('Edit account');
    expect(el.querySelector<HTMLInputElement>('l-text-input input')!.value).toBe('Car loan');
    expect(el.querySelector<HTMLInputElement>('l-number-input input')!.value).toBe('5000.00');
    expect(amountLabels()).toEqual(['Opening amount owed']);

    type('l-number-input input', '5200');
    click('Save');

    expect(store.byId(id)).toMatchObject({ openingBalance: -520000, currentBalance: -470000 });
    expect(close).toHaveBeenCalledWith(id);
  });
});
