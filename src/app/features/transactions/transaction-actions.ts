import { Injectable, Injector, inject } from '@angular/core';
import { Observable, ReplaySubject, firstValueFrom } from 'rxjs';
import { localDate, toNewTransaction } from '../../core/domain/transactions';
import { NewTransaction, Transaction } from '../../core/models/transaction';
import { ConfirmDialog, ConfirmDialogData, ModalService } from '../../shared/components/ui/modal';
import { NotificationService } from '../../shared/components/ui/notification';
import { SheetService } from '../../shared/services/sheet.service';
import { AccountActions } from '../accounts/account-actions';
import { AccountsStore } from '../accounts/accounts.store';
import { CategoriesStore } from '../categories/categories.store';
import { BulkEdit, BulkEditData, BulkEditMode } from './bulk-edit/bulk-edit';
import {
  TRANSACTION_FORM_OPTIONS,
  TransactionForm,
  TransactionFormData,
  TransactionFormResult,
} from './transaction-form/transaction-form';
import { entries } from './transaction-labels';
import { TransactionsStore } from './transactions.store';

/** Undo window for single deletes (TXN-07). */
const UNDO_MS = 5000;

/**
 * The transaction flows every screen shares: quick add (TXN-05), edit, duplicate,
 * delete with Undo, and the bulk actions. Root-provided so the shell can open
 * quick add from anywhere.
 */
@Injectable({ providedIn: 'root' })
export class TransactionActions {
  private readonly store = inject(TransactionsStore);
  private readonly accounts = inject(AccountsStore);
  private readonly accountActions = inject(AccountActions);
  private readonly categories = inject(CategoriesStore);
  private readonly sheets = inject(SheetService);
  private readonly modals = inject(ModalService);
  private readonly notify = inject(NotificationService);
  private readonly injector = inject(Injector);

  /**
   * Opens the add form (TXN-01), prefilled when given (TXN-11). With no account
   * yet, the account form comes first, since every entry needs one. Emits the
   * form's result once it closes.
   */
  create(prefill: Partial<NewTransaction> = {}): Observable<TransactionFormResult | undefined> {
    if (this.accounts.loading() || this.accounts.active().length) return this.open({ prefill });

    this.notify.info('Add an account first', 'Every entry comes out of or goes into one.');
    const done = new ReplaySubject<TransactionFormResult | undefined>(1);
    this.accountActions.create().subscribe((accountId) => {
      if (accountId) this.open({ prefill: { ...prefill, accountId } }).subscribe(done);
      else done.complete();
    });
    return done;
  }

  /** Opens the form on an existing entry (TXN-06). */
  edit(tx: Transaction): Observable<TransactionFormResult | undefined> {
    return this.open({ transaction: tx });
  }

  /** A prefilled add form dated today, at the current time like any new entry (TXN-11). */
  duplicate(tx: Transaction): Observable<TransactionFormResult | undefined> {
    return this.create({ ...toNewTransaction(tx), date: localDate(), time: undefined });
  }

  /** Deletes at once, with a 5-second Undo (TXN-07). */
  delete(tx: Transaction): void {
    this.store.delete(tx);
    this.notify.info('Transaction deleted', undefined, {
      duration: UNDO_MS,
      action: { label: 'Undo', handler: () => this.store.restore([tx]) },
    });
  }

  /** Bulk delete asks first, since it can't be undone (TXN-13). Resolves to whether it ran. */
  async deleteMany(txs: readonly Transaction[]): Promise<boolean> {
    if (!txs.length) return false;
    const what = entries(txs.length);
    const confirmed = await firstValueFrom(
      this.modals
        .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
          data: {
            title: `Delete ${what}?`,
            message: "Their amounts come off your account balances. This can't be undone.",
            confirmText: `Delete ${what}`,
            confirmVariant: 'danger',
          },
        })
        .afterClosed(),
    );
    if (!confirmed) return false;
    this.store.deleteMany(txs);
    this.notify.success(`${what[0].toUpperCase()}${what.slice(1)} deleted`);
    return true;
  }

  /** Moves the entries to a category picked in a sheet (TXN-13). Resolves to whether any moved. */
  async recategorize(txs: readonly Transaction[]): Promise<boolean> {
    const categoryId = await this.pick('category', txs);
    const category = this.categories.byId(categoryId);
    if (!category) return false;
    const moved = this.store.recategorize(txs, category);
    this.report(moved, txs.length, `to ${this.categories.path(category)}`, 'kept their category');
    return moved > 0;
  }

  /** Moves the entries to an account picked in a sheet (TXN-13). Resolves to whether any moved. */
  async move(txs: readonly Transaction[]): Promise<boolean> {
    const accountId = await this.pick('account', txs);
    const account = accountId ? this.accounts.byId(accountId) : undefined;
    if (!account) return false;
    const moved = this.store.move(txs, account.id);
    this.report(moved, txs.length, `to ${account.name}`, 'stayed where they were');
    return moved > 0;
  }

  private open(data: TransactionFormData): Observable<TransactionFormResult | undefined> {
    const result$ = this.sheets.open<TransactionFormResult, TransactionFormData>(
      TransactionForm,
      data,
      TRANSACTION_FORM_OPTIONS,
    );
    // Duplicate, delete and Make recurring close the form first, then run here.
    result$.subscribe((result) => {
      if (result?.action === 'duplicate') this.duplicate(result.transaction).subscribe();
      if (result?.action === 'delete') this.delete(result.transaction);
      if (result?.action === 'recurring') void this.makeRecurring(result.transaction);
    });
    return result$;
  }

  /**
   * Opens a recurring rule prefilled from the entry (REC-01). The recurring
   * screens load on first use, which keeps them out of this chunk.
   */
  async makeRecurring(tx: Transaction): Promise<void> {
    const { RecurringActions } = await import('../recurring/recurring-actions');
    this.injector.get(RecurringActions).createFrom(tx).subscribe();
  }

  private pick(mode: BulkEditMode, txs: readonly Transaction[]): Promise<string | undefined> {
    if (!txs.length) return Promise.resolve(undefined);
    return firstValueFrom(
      this.sheets.open<string, BulkEditData>(BulkEdit, { mode, transactions: [...txs] }),
    );
  }

  /** "5 transactions moved to Food", noting any that couldn't take the change. */
  private report(moved: number, total: number, where: string, keptNote: string): void {
    const kept = total - moved;
    if (!moved) {
      this.notify.info('Nothing to change', `The selected ${entries(total)} ${keptNote}.`);
      return;
    }
    this.notify.success(
      `${entries(moved)[0].toUpperCase()}${entries(moved).slice(1)} moved ${where}`,
      kept ? `${entries(kept)} ${keptNote}.` : undefined,
    );
  }
}
