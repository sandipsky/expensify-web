import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { map, of } from 'rxjs';
import { AccountInput } from '../../core/models/account';
import { Preferences } from '../../core/preferences';
import { ConfirmDialogData, ModalService } from '../../shared/components/ui/modal';
import { NotificationOptions, NotificationService } from '../../shared/components/ui/notification';
import { AccountActions } from './account-actions';
import { AccountsStore } from './accounts.store';

const input = (overrides: Partial<AccountInput> = {}): AccountInput => ({
  name: 'Cash',
  type: 'cash',
  openingBalance: 0,
  creditLimit: null,
  includeInTotal: true,
  ...overrides,
});

describe('AccountActions', () => {
  let actions: AccountActions;
  let store: AccountsStore;
  let confirmResult: boolean;
  const open = vi.fn();
  const toasts = { success: vi.fn(), info: vi.fn() };

  /** The data of the last ConfirmDialog opened. */
  const dialog = () => open.mock.lastCall![1].data as ConfirmDialogData;
  /** The Undo handler of the last toast of that kind. */
  const undo = (kind: 'success' | 'info') =>
    (toasts[kind].mock.lastCall![2] as NotificationOptions).action!.handler;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    confirmResult = true;
    open.mockImplementation((_component, config: { data: ConfirmDialogData }) => ({
      afterClosed: () => {
        if (!confirmResult) return of(false);
        // ConfirmDialog runs onConfirm before closing with true.
        return config.data.onConfirm ? config.data.onConfirm().pipe(map(() => true)) : of(true);
      },
    }));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Preferences,
          useValue: { locale: signal('en-US'), baseCurrency: signal('USD') },
        },
        { provide: ModalService, useValue: { open } },
        { provide: NotificationService, useValue: toasts },
      ],
    });
    actions = TestBed.inject(AccountActions);
    store = TestBed.inject(AccountsStore);
  });

  describe('archive (ACC-04)', () => {
    it('archives a zero-balance account at once, with Undo', () => {
      const account = store.byId(store.create(input()))!;
      actions.archive(account);

      expect(open).not.toHaveBeenCalled();
      expect(store.byId(account.id)!.archived).toBe(true);

      undo('success')();
      expect(store.byId(account.id)!.archived).toBe(false);
    });

    it('warns first when the balance is not zero', () => {
      const card = store.byId(
        store.create(input({ name: 'Visa', type: 'credit_card', openingBalance: -4500 })),
      )!;

      confirmResult = false;
      actions.archive(card);
      expect(dialog().message).toContain("Its balance isn't zero ($45.00 owed)");
      expect(store.byId(card.id)!.archived).toBe(false);

      confirmResult = true;
      actions.archive(card);
      expect(store.byId(card.id)!.archived).toBe(true);
    });

    it('restores an archived account', () => {
      const account = store.byId(store.create(input()))!;
      store.setArchived(account, true);
      actions.restore(store.byId(account.id)!);
      expect(store.byId(account.id)!.archived).toBe(false);
    });
  });

  describe('delete (ACC-05)', () => {
    it('deletes an account without transactions at once, with a 5-second Undo', async () => {
      const account = store.byId(store.create(input({ name: 'Wallet', openingBalance: 1200 })))!;

      expect(await actions.delete(account)).toBe(true);
      expect(open).not.toHaveBeenCalled();
      expect(store.all()).toEqual([]);
      expect(toasts.info.mock.lastCall![2]).toMatchObject({ duration: 5000 });

      undo('info')();
      expect(store.byId(account.id)).toMatchObject({ name: 'Wallet', currentBalance: 1200 });
    });

    it('asks before deleting an account with transactions, which go too', async () => {
      const account = store.byId(store.create(input({ name: 'Bank', type: 'bank' })))!;
      store.reconcile(account, 5000);

      confirmResult = false;
      expect(await actions.delete(account)).toBe(false);
      expect(dialog()).toMatchObject({
        title: 'Delete Bank?',
        confirmText: 'Delete account and 1 transaction',
        confirmVariant: 'danger',
      });
      expect(store.all()).toHaveLength(1);

      confirmResult = true;
      expect(await actions.delete(account)).toBe(true);
      expect(store.all()).toEqual([]);
    });
  });
});
