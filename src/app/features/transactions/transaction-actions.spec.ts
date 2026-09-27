import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, firstValueFrom, of } from 'rxjs';
import { Transaction } from '../../core/models/transaction';
import { Preferences } from '../../core/preferences';
import { ModalService } from '../../shared/components/ui/modal';
import { NotificationOptions, NotificationService } from '../../shared/components/ui/notification';
import { SheetService } from '../../shared/services/sheet.service';
import { AccountActions } from '../accounts/account-actions';
import { AccountsStore } from '../accounts/accounts.store';
import { CategoriesStore } from '../categories/categories.store';
import { BulkEdit } from './bulk-edit/bulk-edit';
import { TransactionActions } from './transaction-actions';
import { TransactionForm, TransactionFormResult } from './transaction-form/transaction-form';
import { TransactionsStore } from './transactions.store';

const account = { openingBalance: 0, creditLimit: null, includeInTotal: true };

describe('TransactionActions', () => {
  const toasts = { success: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const sheetOpen = vi.fn();
  const modalOpen = vi.fn();
  const createAccount = vi.fn();
  let actions: TransactionActions;
  let store: TransactionsStore;
  let accounts: AccountsStore;
  let cash: string;

  const add = async (overrides: Partial<Transaction> = {}) => {
    const id = store.add({
      type: 'expense',
      amount: 1000,
      currency: 'USD',
      accountId: cash,
      categoryId: 'exp_food',
      date: '2026-09-20',
      tags: ['x'],
      ...overrides,
    });
    return (await firstValueFrom(store.watch(id)))!;
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    sheetOpen.mockReturnValue(of(undefined));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Preferences,
          useValue: { locale: signal('en-US'), baseCurrency: signal('USD') },
        },
        { provide: NotificationService, useValue: toasts },
        { provide: SheetService, useValue: { open: sheetOpen } },
        { provide: ModalService, useValue: { open: modalOpen } },
        { provide: AccountActions, useValue: { create: createAccount } },
      ],
    });
    accounts = TestBed.inject(AccountsStore);
    store = TestBed.inject(TransactionsStore);
    actions = TestBed.inject(TransactionActions);
    TestBed.inject(CategoriesStore).seedDefaults();
  });

  describe('with an account', () => {
    beforeEach(() => {
      cash = accounts.create({ ...account, name: 'Cash', type: 'cash' });
    });

    it('opens the form as a tall sheet on phones and a wide dialog elsewhere (TXN-05)', () => {
      actions.create().subscribe();
      expect(sheetOpen).toHaveBeenCalledWith(
        TransactionForm,
        { prefill: {} },
        { width: '560px', maxHeight: '760px', phoneHeight: '94dvh' },
      );
    });

    it('deletes at once with a 5-second Undo that restores the balance (TXN-07)', async () => {
      const tx = await add();
      expect(accounts.byId(cash)!.currentBalance).toBe(-1000);
      actions.delete(tx);
      expect(await firstValueFrom(store.watch(tx.id))).toBeNull();
      expect(accounts.byId(cash)!.currentBalance).toBe(0);

      const options = toasts.info.mock.lastCall![2] as NotificationOptions;
      expect(options.duration).toBe(5000);
      options.action!.handler();
      expect(await firstValueFrom(store.watch(tx.id))).toMatchObject({ tags: ['x'] });
      expect(accounts.byId(cash)!.currentBalance).toBe(-1000);
    });

    it('duplicates into a prefilled form dated today (TXN-11)', async () => {
      const tx = await add({ payee: 'Fresh Mart', time: '08:00' });
      actions.duplicate(tx).subscribe();
      const prefill = sheetOpen.mock.lastCall![1].prefill;
      expect(prefill).toMatchObject({ payee: 'Fresh Mart', amount: 1000, tags: ['x'] });
      expect(prefill.date).toBe(new Date().toLocaleDateString('sv'));
      expect(prefill.time).toBeUndefined();
    });

    it('carries out duplicate and delete when the form closes with them', async () => {
      const tx = await add();
      const closed = new Subject<TransactionFormResult | undefined>();
      sheetOpen.mockReturnValueOnce(closed);
      actions.edit(tx).subscribe();
      closed.next({ action: 'delete', transaction: tx });
      expect(await firstValueFrom(store.watch(tx.id))).toBeNull();
      expect(toasts.info).toHaveBeenCalledWith('Transaction deleted', undefined, expect.anything());
    });

    it('asks before a bulk delete, which has no Undo (TXN-13)', async () => {
      const txs = [await add(), await add()];
      modalOpen.mockReturnValue({ afterClosed: () => of(false) });
      expect(await actions.deleteMany(txs)).toBe(false);
      expect(await firstValueFrom(store.watchRecent())).toHaveLength(2);

      modalOpen.mockReturnValue({ afterClosed: () => of(true) });
      expect(await actions.deleteMany(txs)).toBe(true);
      expect(modalOpen.mock.lastCall![1].data).toMatchObject({
        title: 'Delete 2 transactions?',
        confirmVariant: 'danger',
      });
      expect(await firstValueFrom(store.watchRecent())).toHaveLength(0);
      expect(accounts.byId(cash)!.currentBalance).toBe(0);
    });

    it('recategorizes the selection to a category picked in a sheet (TXN-13)', async () => {
      const txs = [
        await add(),
        await add({ type: 'transfer', categoryId: null, toAccountId: cash }),
      ];
      sheetOpen.mockReturnValueOnce(of('exp_groceries'));
      expect(await actions.recategorize(txs)).toBe(true);
      expect(sheetOpen).toHaveBeenCalledWith(BulkEdit, { mode: 'category', transactions: txs });
      expect(toasts.success).toHaveBeenCalledWith(
        '1 transaction moved to Groceries',
        '1 transaction kept their category.',
      );
    });
  });

  it('asks for an account first when there is none, then opens the form on it', async () => {
    createAccount.mockReturnValue(of('new-account'));
    const result = actions.create();
    expect(createAccount).toHaveBeenCalled();
    expect(sheetOpen).toHaveBeenCalledWith(
      TransactionForm,
      { prefill: { accountId: 'new-account' } },
      expect.anything(),
    );
    expect(await firstValueFrom(result, { defaultValue: 'none' })).toBeUndefined();
  });
});
