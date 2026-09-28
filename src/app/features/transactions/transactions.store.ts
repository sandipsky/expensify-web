import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { ReceiptsRepo } from '../../core/data/receipts.repo';
import { TransactionEdit, TransactionsRepo } from '../../core/data/transactions.repo';
import { attachmentsOf } from '../../core/domain/attachments';
import { DateRange } from '../../core/domain/period';
import { withAccount, withCategory } from '../../core/domain/transactions';
import { Category } from '../../core/models/category';
import { NewTransaction, Transaction } from '../../core/models/transaction';
import { Preferences } from '../../core/preferences';
import { AccountsStore } from '../accounts/accounts.store';

/** Where this device remembers the account the last entry used (TXN-04). */
const LAST_ACCOUNT_KEY = 'expensify.last-account';

/** How many past entries suggestions look at: a few weeks of daily use (TXN-12). */
const RECENT_LIMIT = 200;

/**
 * Transactions for the whole app: quick add opens from every screen (TXN-05),
 * so the writes, the last-used account and the suggestion source live here,
 * root-provided. The list's period and filters live in `TransactionListStore`,
 * which the Transactions page provides.
 */
@Injectable({ providedIn: 'root' })
export class TransactionsStore {
  private readonly repo = inject(TransactionsRepo);
  private readonly receipts = inject(ReceiptsRepo);
  private readonly accounts = inject(AccountsStore);

  /** New entries use the base currency until multi-currency (§8). */
  readonly currency = inject(Preferences).baseCurrency;

  private readonly lastAccountId = signal(readLastAccount());

  /**
   * The account a new entry starts on (TXN-04): the one this device used last
   * while it's still active, otherwise the first active account.
   */
  readonly defaultAccountId = computed(() => {
    const active = this.accounts.active();
    const last = this.lastAccountId();
    return (active.find((a) => a.id === last) ?? active[0])?.id ?? null;
  });

  /** The period's transactions, newest date first; pass `limit` to page a long one (LST-04). */
  watchRange(range: DateRange, limit?: number): Observable<Transaction[]> {
    return this.repo.watchRange(range, limit);
  }

  /** The newest entries by date, for payee, tag and category suggestions (TXN-12, TXN-15). */
  watchRecent(): Observable<Transaction[]> {
    return this.repo.watchRecent(RECENT_LIMIT);
  }

  /** One transaction, live; `null` once deleted. */
  watch(id: string): Observable<Transaction | null> {
    return this.repo.watch(id);
  }

  /** An ID for an entry not saved yet, so its receipts can go up while the form is open. */
  newId(): string {
    return this.repo.newId();
  }

  /**
   * Saves a new entry (TXN-01) and remembers its account for the next one
   * (TXN-04). Pass `id` when receipts were already stored under it.
   */
  add(tx: NewTransaction, id?: string): string {
    id = this.repo.add(tx, id);
    this.lastAccountId.set(tx.accountId);
    try {
      localStorage.setItem(LAST_ACCOUNT_KEY, tx.accountId);
    } catch {
      // Storage blocked: remember it for this session only.
    }
    return id;
  }

  /**
   * Saves an edit; every balance it touches moves in the same write (TXN-06).
   * Resolves to whether it went through.
   */
  update(before: Transaction, after: NewTransaction): Promise<boolean> {
    return this.repo.update(before, after);
  }

  /** Deletes the entry; its receipts go once the Undo has passed (TXN-07, ATT-05). */
  delete(tx: Transaction): void {
    this.repo.delete(tx);
    this.receipts.deleteLater(tx.id, tx.attachments ?? []);
  }

  /** Undoes a delete of these transactions, receipts included (TXN-07). */
  restore(txs: readonly Transaction[]): void {
    for (const tx of txs) this.receipts.keep(tx.id);
    this.repo.restore(txs);
  }

  /** Deletes the entries and their receipts; there's no Undo for a bulk delete (TXN-13, ATT-05). */
  deleteMany(txs: readonly Transaction[]): void {
    this.repo.deleteMany(txs);
    this.receipts.delete(attachmentsOf(txs));
  }

  /**
   * Moves the entries of the category's type into it, in one write (TXN-13).
   * Transfers and entries of the other type keep theirs. Returns how many moved.
   */
  recategorize(txs: readonly Transaction[], category: Pick<Category, 'id' | 'type'>): number {
    return this.edit(txs, (tx) => withCategory(tx, category));
  }

  /**
   * Moves the entries to the account, in one write (TXN-13). A transfer moves
   * the account it comes from, unless it goes into that account. Returns how
   * many moved.
   */
  move(txs: readonly Transaction[], accountId: string): number {
    return this.edit(txs, (tx) => withAccount(tx, accountId));
  }

  private edit(
    txs: readonly Transaction[],
    change: (tx: Transaction) => NewTransaction | null,
  ): number {
    const edits: TransactionEdit[] = [];
    for (const before of txs) {
      const after = change(before);
      if (after) edits.push({ before, after });
    }
    this.repo.updateMany(edits);
    return edits.length;
  }
}

function readLastAccount(): string | null {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    return null;
  }
}
