import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LocalDb } from '../../../core/data/local-db';
import { Transaction, TxType } from '../../../core/models/transaction';
import { Preferences } from '../../../core/preferences';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { MODAL_DATA, ModalRef } from '../../../shared/components/ui/modal';
import { NotificationService } from '../../../shared/components/ui/notification';
import { AccountsStore } from '../../accounts/accounts.store';
import { CategoriesStore } from '../../categories/categories.store';
import { ReceiptsRepo } from '../../../core/data/receipts.repo';
import { ReceiptDraft } from '../receipts/receipt-draft';
import { TransactionsStore } from '../transactions.store';
import { TransactionForm, TransactionFormData } from './transaction-form';

const account = { openingBalance: 100000, creditLimit: null, includeInTotal: true };

describe('TransactionForm', () => {
  const close = vi.fn();
  const toasts = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() };
  let cash: string;
  let bank: string;
  /** What the form is opened with; read when the form is created. */
  let formData: TransactionFormData = {};

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // Only Date: Angular's own timers keep running for real.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 27, 14, 5));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Preferences,
          useValue: {
            locale: signal('en-US'),
            baseCurrency: signal('USD'),
            monthStartDay: signal(1),
          },
        },
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
        { provide: ModalRef, useValue: { close } },
        { provide: MODAL_DATA, useFactory: () => formData },
        { provide: NotificationService, useValue: toasts },
      ],
    });
    const accounts = TestBed.inject(AccountsStore);
    cash = accounts.create({ ...account, name: 'Cash', type: 'cash' });
    bank = accounts.create({ ...account, name: 'Bank', type: 'bank' });
    TestBed.inject(CategoriesStore).seedDefaults();
  });

  afterEach(() => vi.useRealTimers());

  async function setup(data: TransactionFormData = {}) {
    formData = data;
    const fixture = TestBed.createComponent(TransactionForm);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const form = fixture.componentInstance['form'];
    const typeAmount = (text: string) => {
      const input = el.querySelector<HTMLInputElement>('.tx-form__amount input')!;
      input.dispatchEvent(new FocusEvent('focus'));
      input.value = text;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new FocusEvent('blur'));
      fixture.detectChanges();
    };
    const pick = (label: string) => {
      el.querySelector<HTMLInputElement>(`input[type="radio"][aria-label="${label}"]`)!.click();
      fixture.detectChanges();
    };
    const click = (label: string) => {
      const buttons = [
        ...el.querySelectorAll<HTMLButtonElement>('l-button button, [dropdown-item]'),
      ];
      buttons.find((b) => b.textContent?.trim() === label)!.click();
      fixture.detectChanges();
    };
    const setType = (type: TxType) => {
      form.controls.type.setValue(type);
      fixture.detectChanges();
    };
    const tiles = () =>
      [...el.querySelectorAll('.l-icon-tile__label')].map((label) => label.textContent);
    const errors = () => [...el.querySelectorAll('.alert.error')].map((a) => a.textContent);
    return { fixture, el, form, typeAmount, pick, click, setType, tiles, errors };
  }

  const stored = async () =>
    (await TestBed.inject(LocalDb).get('users/local/transactions')).map(
      (doc) => ({ ...doc.data, id: doc.id }) as unknown as Transaction,
    );
  const balances = () =>
    Object.fromEntries(
      TestBed.inject(AccountsStore)
        .all()
        .map((a) => [a.name, a.currentBalance]),
    );

  it('starts as an expense, today and now, on the last-used account (TXN-04)', async () => {
    localStorage.setItem('expensify.last-account', bank);
    const { form, el } = await setup();
    expect(el.querySelector('h2')!.textContent).toBe('Add transaction');
    expect(form.getRawValue()).toMatchObject({ type: 'expense', accountId: bank, time: '14:05' });
    expect(form.controls.date.value!.toDateString()).toBe(new Date(2026, 8, 27).toDateString());
    // Payee, time, tags and note wait behind "More" (§13).
    expect(el.querySelector('l-text-input')).toBeNull();
  });

  it('saves nothing until amount and category are given (TXN-02)', async () => {
    const { click, errors } = await setup();
    click('Save');
    expect(await stored()).toHaveLength(0);
    expect(errors()).toContain('This field is required.');
    expect(close).not.toHaveBeenCalled();
  });

  it('saves an expense in minor units and takes it off the account at once (TXN-01, US-01)', async () => {
    const { typeAmount, pick, click } = await setup();
    typeAmount('12.5');
    pick('Food and dining');
    click('Save');

    const [tx] = await stored();
    expect(tx).toMatchObject({
      type: 'expense',
      amount: 1250,
      currency: 'USD',
      accountId: cash,
      accountIds: [cash],
      categoryId: 'exp_food',
      toAccountId: null,
      date: '2026-09-27',
      time: '14:05',
      source: 'web',
    });
    expect(balances()).toEqual({ Cash: 98750, Bank: 100000 });
    expect(close).toHaveBeenCalledWith({ action: 'saved', id: tx.id });
    expect(toasts.success).toHaveBeenCalledWith('Expense added', '$12.50 · Food and dining');
  });

  it('works out a sum typed in the amount (TXN-16)', async () => {
    const { typeAmount, pick, click } = await setup();
    typeAmount('120+45');
    pick('Groceries');
    click('Save');
    expect((await stored())[0].amount).toBe(16500);
  });

  it('refuses a zero amount', async () => {
    const { typeAmount, pick, click, errors } = await setup();
    typeAmount('0');
    pick('Groceries');
    click('Save');
    expect(await stored()).toHaveLength(0);
    expect(errors()).toContain('Enter an amount above zero.');
  });

  it('moves money between two different accounts, with no category (TXN-02, US-02)', async () => {
    const { form, typeAmount, setType, click, errors, fixture } = await setup();
    typeAmount('200');
    setType('transfer');
    form.controls.accountId.setValue(bank);
    form.controls.toAccountId.setValue(bank);
    form.controls.toAccountId.markAsTouched();
    fixture.detectChanges();
    click('Save');
    expect(errors()).toContain('Pick a different account from the one it comes from.');
    expect(await stored()).toHaveLength(0);

    form.controls.toAccountId.setValue(cash);
    click('Save');
    expect((await stored())[0]).toMatchObject({
      type: 'transfer',
      categoryId: null,
      accountIds: [bank, cash],
    });
    expect(balances()).toEqual({ Cash: 120000, Bank: 80000 });
  });

  it("keeps each type's category when switching type and back", async () => {
    const { form, pick, setType } = await setup();
    pick('Groceries');
    setType('income');
    expect(form.controls.categoryId.value).toBeNull();
    setType('transfer');
    setType('expense');
    expect(form.controls.categoryId.value).toBe('exp_groceries');
  });

  it('keeps type, account and date for the next entry with Save and add another (TXN-10)', async () => {
    const { form, typeAmount, pick, click } = await setup();
    form.controls.accountId.setValue(bank);
    typeAmount('5');
    pick('Transport');
    click('Save and add another');

    expect(await stored()).toHaveLength(1);
    expect(close).not.toHaveBeenCalled();
    expect(form.getRawValue()).toMatchObject({
      type: 'expense',
      accountId: bank,
      amount: null,
      categoryId: null,
    });
    expect(form.controls.date.value!.getDate()).toBe(27);
  });

  it('edits any field and moves every balance it touches (TXN-06, US-03)', async () => {
    const store = TestBed.inject(TransactionsStore);
    store.add({
      type: 'expense',
      amount: 3000,
      currency: 'USD',
      accountId: cash,
      categoryId: 'exp_food',
      date: '2026-09-20',
      tags: [],
    });
    const [tx] = await stored();
    expect(balances()).toEqual({ Cash: 97000, Bank: 100000 });

    const { el, form, typeAmount, click } = await setup({ transaction: tx });
    expect(el.querySelector('h2')!.textContent).toBe('Edit transaction');
    expect(form.getRawValue()).toMatchObject({ amount: 30, time: '' });
    typeAmount('45');
    form.controls.accountId.setValue(bank);
    click('Save');

    expect(balances()).toEqual({ Cash: 100000, Bank: 95500 });
    expect((await stored())[0]).toMatchObject({
      amount: 4500,
      accountId: bank,
      date: '2026-09-20',
    });
  });

  it('hands duplicate and delete back to the opener', async () => {
    TestBed.inject(TransactionsStore).add({
      type: 'income',
      amount: 500,
      currency: 'USD',
      accountId: bank,
      categoryId: 'inc_salary',
      date: '2026-09-01',
      tags: [],
    });
    const [tx] = await stored();
    const { click } = await setup({ transaction: tx });
    click('More actions');
    click('Duplicate');
    expect(close).toHaveBeenLastCalledWith({
      action: 'duplicate',
      transaction: expect.objectContaining({ id: tx.id }),
    });
    click('More actions');
    click('Delete');
    expect(close).toHaveBeenLastCalledWith({
      action: 'delete',
      transaction: expect.objectContaining({ id: tx.id }),
    });
    click('More actions');
    click('Make recurring');
    expect(close).toHaveBeenLastCalledWith({
      action: 'recurring',
      transaction: expect.objectContaining({ id: tx.id }),
    });
  });

  it('opens the rule a recurring entry came from instead of making it recurring (REC-01)', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    TestBed.inject(TransactionsStore).add({
      type: 'income',
      amount: 500,
      currency: 'USD',
      accountId: bank,
      categoryId: 'inc_salary',
      date: '2026-09-01',
      tags: [],
      recurringRuleId: 'rule1',
    });
    const [tx] = await stored();
    const { el, click } = await setup({ transaction: tx });
    click('More actions');
    expect(el.textContent).not.toContain('Make recurring');
    click('Open recurring rule');
    expect(close).toHaveBeenLastCalledWith(undefined);
    expect(navigate).toHaveBeenCalledWith(['/recurring', 'rule1']);
  });

  it('hands a draft back without saving it, as confirming an edited recurring entry does (REC-04)', async () => {
    const { el, form, typeAmount, click } = await setup({
      prefill: {
        type: 'expense',
        amount: 80000,
        accountId: cash,
        categoryId: 'exp_housing',
        date: '2026-09-05',
        time: null,
      },
      draft: { title: 'Confirm recurring entry', saveLabel: 'Add entry' },
    });
    expect(el.querySelector('h2')!.textContent).toBe('Confirm recurring entry');
    expect(el.textContent).not.toContain('Save and add another');
    expect(form.controls.time.value).toBe('');

    typeAmount('850');
    click('Add entry');
    expect(close).toHaveBeenLastCalledWith({
      action: 'draft',
      transaction: expect.objectContaining({ amount: 85000, date: '2026-09-05', accountId: cash }),
    });
    expect(await stored()).toEqual([]);
    expect(toasts.success).not.toHaveBeenCalled();
  });

  describe('suggestions from past entries', () => {
    beforeEach(() => {
      const store = TestBed.inject(TransactionsStore);
      const base = { type: 'expense' as const, currency: 'USD', accountId: cash, amount: 100 };
      store.add({
        ...base,
        categoryId: 'exp_groceries',
        date: '2026-09-25',
        payee: 'Fresh Mart',
        tags: ['home'],
      });
      store.add({
        ...base,
        categoryId: 'exp_transport',
        date: '2026-09-26',
        payee: 'City bus',
        tags: [],
      });
    });

    it('lists recently used categories first (§13)', async () => {
      const { tiles } = await setup();
      expect(tiles().slice(0, 3)).toEqual(['Transport', 'Groceries', 'Food and dining']);
    });

    it('offers past payees and tags (TXN-12)', async () => {
      const { el, click, fixture } = await setup();
      click('Payee, time, tags, note and receipts');
      await fixture.whenStable();
      const options = [...el.querySelectorAll('datalist option')].map((o) =>
        o.getAttribute('value'),
      );
      expect(options).toEqual(['City bus', 'Fresh Mart']);
      expect(fixture.componentInstance['tagItems']()).toEqual(['home']);
    });

    it("picks the payee's last category until the user picks one (TXN-15)", async () => {
      const { form, el, click, pick, fixture } = await setup();
      click('Payee, time, tags, note and receipts');
      form.controls.payee.setValue('fresh mart');
      fixture.detectChanges();
      expect(form.controls.categoryId.value).toBe('exp_groceries');
      expect(el.textContent).toContain('Picked from your last entry for fresh mart.');

      pick('Shopping');
      form.controls.payee.setValue('City bus');
      expect(form.controls.categoryId.value).toBe('exp_shopping');
    });
  });
  describe('receipts (§3.12)', () => {
    const bill = () => new File(['%PDF'], 'bill.pdf', { type: 'application/pdf' });

    it('saves a new entry with the receipts stored under its ID (ATT-01)', async () => {
      const { fixture, typeAmount, pick, click, el } = await setup();
      typeAmount('12.5');
      pick('Food and dining');
      click('Payee, time, tags, note and receipts');
      expect(el.querySelector('app-receipt-list')).not.toBeNull();
      await fixture.debugElement.injector.get(ReceiptDraft).add([bill()]);
      fixture.detectChanges();
      expect(el.querySelector('.receipt__name')!.textContent).toBe('bill.pdf');

      click('Save');
      const [tx] = await stored();
      expect(tx.attachments).toEqual([
        expect.objectContaining({ name: 'bill.pdf', contentType: 'application/pdf', size: 4 }),
      ]);
      expect(tx.attachments![0].path.startsWith(`users/local/receipts/${tx.id}/`)).toBe(true);
    });

    it('waits for receipts still uploading before saving', async () => {
      const { fixture, typeAmount, pick, click } = await setup();
      typeAmount('5');
      pick('Food and dining');
      const upload = vi
        .spyOn(TestBed.inject(ReceiptsRepo), 'upload')
        .mockReturnValue(new Promise(() => {}));
      void fixture.debugElement.injector.get(ReceiptDraft).add([bill()]);
      await Promise.resolve();
      click('Save');
      expect(toasts.info).toHaveBeenCalledWith('Receipts are still uploading', expect.any(String));
      expect(await stored()).toEqual([]);
      upload.mockRestore();
    });

    it('opens an entry with its receipts showing, and saves their removal (ATT-04)', async () => {
      const store = TestBed.inject(TransactionsStore);
      const id = store.newId();
      const receipt = await TestBed.inject(ReceiptsRepo).upload(id, bill(), 'bill.pdf');
      store.add(
        {
          type: 'expense',
          amount: 500,
          currency: 'USD',
          accountId: cash,
          categoryId: 'exp_food',
          date: '2026-09-27',
          tags: [],
          attachments: [receipt],
        },
        id,
      );
      const [transaction] = await stored();
      const { fixture, el, click } = await setup({ transaction });
      expect(el.querySelector('.receipt__name')!.textContent).toBe('bill.pdf');

      fixture.debugElement.injector.get(ReceiptDraft).remove(receipt.path);
      fixture.detectChanges();
      click('Save');
      await vi.waitFor(async () => expect((await stored())[0].attachments).toEqual([]));
    });
  });
});
