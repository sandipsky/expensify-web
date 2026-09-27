import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, from } from 'rxjs';
import { formatMoney } from '../../core/domain/money';
import { Account } from '../../core/models/account';
import { Preferences } from '../../core/preferences';
import { ConfirmDialog, ConfirmDialogData, ModalService } from '../../shared/components/ui/modal';
import { NotificationService } from '../../shared/components/ui/notification';
import { SheetService } from '../../shared/services/sheet.service';
import { AccountForm, AccountFormData } from './account-form/account-form';
import { balanceView } from './account-labels';
import { AccountsStore } from './accounts.store';
import { ReconcileForm, ReconcileFormData } from './reconcile-form/reconcile-form';

/** Undo window for single deletes and archives (TXN-07). */
const UNDO_MS = 5000;

/** The accounts screens' user flows: forms, warnings, confirmations and Undo. */
@Injectable({ providedIn: 'root' })
export class AccountActions {
  private readonly store = inject(AccountsStore);
  private readonly sheets = inject(SheetService);
  private readonly modals = inject(ModalService);
  private readonly notify = inject(NotificationService);
  private readonly locale = inject(Preferences).locale;

  /** Opens the add form (ACC-01). Emits the new account's ID, or `undefined` if cancelled. */
  create(): Observable<string | undefined> {
    return this.sheets.open<string, AccountFormData>(AccountForm, {});
  }

  edit(account: Account): void {
    this.sheets.open<string, AccountFormData>(AccountForm, { account });
  }

  reconcile(account: Account): void {
    this.sheets.open<unknown, ReconcileFormData>(ReconcileForm, { account });
  }

  /**
   * Archives at once when the balance is zero. Otherwise it warns first, because
   * the money leaves the total (ACC-04).
   */
  archive(account: Account): void {
    if (account.currentBalance === 0) {
      this.archiveNow(account);
      return;
    }
    const view = balanceView(account);
    const amount = formatMoney(view.amount, account.currency, this.locale());
    const balance = view.caption === 'Owed' ? `${amount} owed` : amount;
    this.modals
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
        data: {
          title: `Archive ${account.name}?`,
          message:
            `Its balance isn't zero (${balance}). Archiving hides it from pickers, the ` +
            'dashboard and your total balance. Its history stays, and you can restore it anytime.',
          confirmText: 'Archive',
          confirmVariant: 'primary',
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) this.archiveNow(account);
      });
  }

  restore(account: Account): void {
    this.store.setArchived(account, false);
    this.notify.success('Account restored', account.name);
  }

  /**
   * Deletes an account with no transactions at once, with Undo. One with
   * transactions needs a confirmation, since they're deleted too and that can't
   * be undone (ACC-05). Resolves to whether the account was deleted.
   */
  async delete(account: Account): Promise<boolean> {
    const count = await this.store.transactionCount(account);
    if (count === 0) {
      await this.store.delete(account);
      this.notify.info('Account deleted', account.name, {
        duration: UNDO_MS,
        action: { label: 'Undo', handler: () => this.store.restore(account) },
      });
      return true;
    }

    const entries = `${count} ${count === 1 ? 'transaction' : 'transactions'}`;
    const confirmed = await firstValueFrom(
      this.modals
        .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
          data: {
            title: `Delete ${account.name}?`,
            message:
              `This also deletes its ${entries} and can't be undone. Transfers ` +
              'with your other accounts come off their balances too.',
            confirmText: `Delete account and ${entries}`,
            confirmVariant: 'danger',
            onConfirm: () => from(this.store.delete(account)),
          },
        })
        .afterClosed(),
    );
    if (confirmed) this.notify.success('Account deleted', account.name);
    return !!confirmed;
  }

  private archiveNow(account: Account): void {
    this.store.setArchived(account, true);
    this.notify.success('Account archived', account.name, {
      duration: UNDO_MS,
      action: { label: 'Undo', handler: () => this.store.setArchived(account, false) },
    });
  }
}
