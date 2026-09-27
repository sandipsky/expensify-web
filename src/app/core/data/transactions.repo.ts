import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { combineEffects, editEffects, effects, reverseEffects } from '../domain/balance';
import { DateRange } from '../domain/period';
import { accountIdsOf, transactionChanges } from '../domain/transactions';
import { NewTransaction, Transaction } from '../models/transaction';
import { LocalBatch, LocalDb, LocalDoc, increment, serverTimestamp } from './local-db';
import { WriteErrors } from './write-errors';

/** One transaction as it was and as it should become. */
export interface TransactionEdit {
  before: Transaction;
  after: NewTransaction;
}

/**
 * `users/{uid}/transactions` (§8). Every write is one batch: the transactions plus
 * `increment()` on each account they move (§4). Writes return before they're
 * confirmed and hand failures to `WriteErrors` (NFR-03). Firestore caps a batch
 * at 500 writes, so the Firestore version of the bulk writes must chunk.
 */
@Injectable({ providedIn: 'root' })
export class TransactionsRepo {
  private readonly db = inject(LocalDb);
  private readonly errors = inject(WriteErrors);
  private readonly path = `${this.db.userPath}/transactions`;

  /**
   * The period's transactions by date, newest first (§10 "Reading a period"). A
   * range on one field needs no composite index. Pass `limit` to page a long
   * period: raising it by a page keeps the list live (LST-04).
   */
  watchRange(range: DateRange, limit?: number): Observable<Transaction[]> {
    return this.db
      .watch(this.path, {
        where: [
          ['date', '>=', range.start],
          ['date', '<=', range.end],
        ],
        orderBy: [['date', 'desc']],
        limit,
      })
      .pipe(map((docs) => docs.map(toTransaction)));
  }

  /** The newest `limit` transactions by date, for suggestions from past entries (TXN-12). */
  watchRecent(limit: number): Observable<Transaction[]> {
    return this.db
      .watch(this.path, { orderBy: [['date', 'desc']], limit })
      .pipe(map((docs) => docs.map(toTransaction)));
  }

  /** One transaction, live; `null` once it's deleted (here or on another device). */
  watch(id: string): Observable<Transaction | null> {
    return this.db.watchDoc(this.doc(id)).pipe(map((doc) => (doc ? toTransaction(doc) : null)));
  }

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

  /**
   * The newest `limit` entries a recurring rule created, by date (composite
   * index: recurringRuleId ↑, date ↓, §8 "Rule history"). Raise `limit` to page.
   */
  watchByRule(ruleId: string, limit: number): Observable<Transaction[]> {
    return this.db
      .watch(this.path, {
        where: [['recurringRuleId', '==', ruleId]],
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

  /**
   * Every transaction in the category, for moving them off it before it's deleted
   * (CAT-06). A single-field equality, so no composite index; the category
   * drill-down adds `date` ordering and needs categoryId ↑, date ↓ (§8).
   */
  async listByCategory(categoryId: string): Promise<Transaction[]> {
    const docs = await this.db.get(this.path, { where: [['categoryId', '==', categoryId]] });
    return docs.map(toTransaction);
  }

  /** Writes the transaction and its balance increments in one batch, and returns its ID. */
  add(tx: NewTransaction): string {
    const id = this.db.newId();
    const batch = this.db.batch().set(this.doc(id), {
      ...tx,
      accountIds: accountIdsOf(tx),
      source: 'web',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    this.commit(batch, effects(tx));
    return id;
  }

  /**
   * Edits a transaction (TXN-06): writes only the fields that changed, and in the
   * same batch reverses the old balance effects and applies the new ones, so a
   * change of type, amount or account moves every balance it touches (§4).
   */
  update(before: Transaction, after: NewTransaction): void {
    this.updateMany([{ before, after }]);
  }

  /** Several edits in one batch, as bulk recategorize and move do (TXN-13). */
  updateMany(edits: readonly TransactionEdit[]): void {
    const batch = this.db.batch();
    const deltas: Map<string, number>[] = [];
    for (const { before, after } of edits) {
      const changes = transactionChanges(before, after);
      if (!Object.keys(changes).length) continue;
      batch.update(this.doc(before.id), { ...changes, updatedAt: serverTimestamp() });
      deltas.push(editEffects(before, after));
    }
    if (deltas.length) this.commit(batch, combineEffects(deltas));
  }

  /** Deletes the transaction and takes its effects off the balances (TXN-07). */
  delete(tx: Transaction): void {
    this.deleteMany([tx]);
  }

  /** Deletes several transactions and their balance effects in one batch (TXN-13). */
  deleteMany(txs: readonly Transaction[]): void {
    if (!txs.length) return;
    const batch = this.db.batch();
    for (const tx of txs) batch.delete(this.doc(tx.id));
    this.commit(batch, combineEffects(txs.map(reverseEffects)));
  }

  /**
   * Puts back transactions deleted moments ago (Undo, TXN-07), under their old IDs
   * with their old fields, and applies their effects again.
   */
  restore(txs: readonly Transaction[]): void {
    if (!txs.length) return;
    const batch = this.db.batch();
    for (const { id, pending: _pending, ...fields } of txs) {
      batch.set(this.doc(id), { ...fields, updatedAt: serverTimestamp() });
    }
    this.commit(batch, combineEffects(txs.map((tx) => effects(tx))));
  }

  private doc(id: string): string {
    return `${this.path}/${id}`;
  }

  /** Adds `increment()` for each non-zero balance change, then commits without waiting. */
  private commit(batch: LocalBatch, deltas: ReadonlyMap<string, number>): void {
    for (const [accountId, delta] of deltas) {
      if (delta !== 0) {
        batch.update(`${this.db.userPath}/accounts/${accountId}`, {
          currentBalance: increment(delta),
          updatedAt: serverTimestamp(),
        });
      }
    }
    // Not awaited: offline, a commit resolves only once the server confirms (§10).
    batch.commit().catch((error) => this.errors.report(error));
  }
}

/** Fills the fields an older or Android-written document may lack. */
function toTransaction(doc: LocalDoc): Transaction {
  const data = doc.data as Partial<Transaction>;
  return {
    ...data,
    id: doc.id,
    accountIds: data.accountIds ?? accountIdsOf(data as Transaction),
    tags: data.tags ?? [],
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    pending: false,
  } as Transaction;
}
