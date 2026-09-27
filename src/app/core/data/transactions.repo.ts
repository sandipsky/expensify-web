import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { effects } from '../domain/balance';
import { NewTransaction, Transaction } from '../models/transaction';
import { LocalDb, LocalDoc, increment, serverTimestamp } from './local-db';
import { WriteErrors } from './write-errors';

/**
 * `users/{uid}/transactions` (§8). Every write is one batch: the transaction plus
 * `increment()` on each account it moves (§4). Writes return before they're
 * confirmed and hand failures to `WriteErrors` (NFR-03).
 */
@Injectable({ providedIn: 'root' })
export class TransactionsRepo {
  private readonly db = inject(LocalDb);
  private readonly errors = inject(WriteErrors);
  private readonly path = `${this.db.userPath}/transactions`;

  /**
   * The newest `limit` transactions touching the account, by date (composite index:
   * accountIds array-contains, date desc). The account page raises `limit` by 50
   * to page in more, which keeps the list live so running balances stay right.
   */
  watchByAccount(accountId: string, limit: number): Observable<Transaction[]> {
    return this.db
      .watch(this.path, {
        where: [['accountIds', 'array-contains', accountId]],
        orderBy: [['date', 'desc']],
        limit,
      })
      .pipe(map((docs) => docs.map(toTransaction)));
  }

  /** Every transaction touching the account, for deleting it with its history (ACC-05). */
  async listByAccount(accountId: string): Promise<Transaction[]> {
    const docs = await this.db.get(this.path, {
      where: [['accountIds', 'array-contains', accountId]],
    });
    return docs.map(toTransaction);
  }

  /** Writes the transaction and its balance increments in one batch, and returns its ID. */
  add(tx: NewTransaction): string {
    const id = this.db.newId();
    const batch = this.db.batch().set(`${this.path}/${id}`, {
      ...tx,
      accountIds: tx.toAccountId ? [tx.accountId, tx.toAccountId] : [tx.accountId],
      source: 'web',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    for (const [accountId, delta] of effects(tx)) {
      if (delta !== 0) {
        batch.update(`${this.db.userPath}/accounts/${accountId}`, {
          currentBalance: increment(delta),
          updatedAt: serverTimestamp(),
        });
      }
    }
    // Not awaited: offline, a commit resolves only once the server confirms (§10).
    batch.commit().catch((error) => this.errors.report(error));
    return id;
  }
}

/** Fills the fields an older or Android-written document may lack. */
function toTransaction(doc: LocalDoc): Transaction {
  const data = doc.data as Partial<Transaction>;
  return {
    ...data,
    id: doc.id,
    tags: data.tags ?? [],
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    pending: false,
  } as Transaction;
}
