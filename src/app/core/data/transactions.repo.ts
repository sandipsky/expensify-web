import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { combineEffects, editEffects, effects, reverseEffects } from '../domain/balance';
import { DateRange } from '../domain/period';
import { accountIdsOf, transactionChanges } from '../domain/transactions';
import { NewTransaction, Transaction, TxSource } from '../models/transaction';
import { Batch, Db, Doc, increment, serverTimestamp } from './db';
import { WriteErrors } from './write-errors';

/** One transaction as it was and as it should become. */
export interface TransactionEdit {
  before: Transaction;
  after: NewTransaction;
}

/** Firestore caps a batch at 500 writes; imports stay well under it. */
const MAX_BATCH_WRITES = 450;

/**
 * `users/{uid}/transactions` (§8). Every write is one batch: the transactions plus
 * `increment()` on each account they move (§4). Writes return before they're
 * confirmed and hand failures to `WriteErrors` (NFR-03). Firestore caps a batch
 * at 500 writes, so the Firestore version of the bulk writes must chunk, as
 * `addMany` already does.
 */
@Injectable({ providedIn: 'root' })
export class TransactionsRepo {
  private readonly db = inject(Db);
  private readonly errors = inject(WriteErrors);
  private get path(): string {
    return `${this.db.userPath}/transactions`;
  }

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

  /**
   * The range's transactions once, newest date first, as export and duplicate
   * checks read them (DAT-01, DAT-02). Pass no range for every transaction.
   */
  async listRange(range: DateRange | null): Promise<Transaction[]> {
    const docs = await this.db.get(this.path, {
      where: range
        ? [
            ['date', '>=', range.start],
            ['date', '<=', range.end],
          ]
        : [],
      orderBy: [['date', 'desc']],
    });
    return docs.map(toTransaction);
  }

  /** An ID for a transaction not written yet, so its receipts can go up first (ATT-01). */
  newId(): string {
    return this.db.newId();
  }

  /** The newest `limit` transactions by date, for suggestions from past entries (TXN-12). */
  watchRecent(limit: number): Observable<Transaction[]> {
    return this.db
      .watch(this.path, { orderBy: [['date', 'desc']], limit })
      .pipe(map((docs) => docs.map(toTransaction)));
  }

  /** One transaction, live; `null` once it's deleted (here or on another device). */
  watch(id: string): Observable<Transaction | null> {
    return this.db.watchDoc(this.doc(id)).pipe(map(({ doc }) => (doc ? toTransaction(doc) : null)));
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

  /**
   * Writes the transaction and its balance increments in one batch, and returns
   * its ID: `id` when given (from `newId()`), otherwise a new one.
   */
  add(tx: NewTransaction, id = this.db.newId()): string {
    const batch = this.db.batch().set(this.doc(id), {
      ...tx,
      accountIds: accountIdsOf(tx),
      source: 'web',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    void this.commit(batch, effects(tx));
    return id;
  }

  /**
   * Writes many new transactions, as an import does (DAT-02): each batch holds
   * whole transactions with their balance increments, so every batch keeps the
   * balances right on its own (§4). Returns the new IDs.
   */
  addMany(txs: readonly NewTransaction[], source: TxSource = 'import'): string[] {
    const ids: string[] = [];
    let batch: Batch | null = null;
    let deltas: Map<string, number>[] = [];
    let accounts = new Set<string>();
    const flush = () => {
      if (!batch) return;
      void this.commit(batch, combineEffects(deltas));
      batch = null;
      deltas = [];
      accounts = new Set();
    };
    for (const tx of txs) {
      // One write per entry, plus one increment per account the batch moves.
      const touched = accountIdsOf(tx);
      const newAccounts = touched.filter((id) => !accounts.has(id)).length;
      if (deltas.length + 1 + accounts.size + newAccounts > MAX_BATCH_WRITES) flush();
      batch ??= this.db.batch();
      const id = this.db.newId();
      batch.set(this.doc(id), {
        ...tx,
        accountIds: touched,
        source,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      deltas.push(effects(tx));
      touched.forEach((accountId) => accounts.add(accountId));
      ids.push(id);
    }
    flush();
    return ids;
  }

  /**
   * Edits a transaction (TXN-06): writes only the fields that changed, and in the
   * same batch reverses the old balance effects and applies the new ones, so a
   * change of type, amount or account moves every balance it touches (§4).
   * Resolves to whether the write went through (offline: once the server
   * confirms), for work that must follow it, such as removing receipt files.
   */
  update(before: Transaction, after: NewTransaction): Promise<boolean> {
    return this.updateMany([{ before, after }]);
  }

  /** Several edits in one batch, as bulk recategorize and move do (TXN-13). */
  updateMany(edits: readonly TransactionEdit[]): Promise<boolean> {
    const batch = this.db.batch();
    const deltas: Map<string, number>[] = [];
    for (const { before, after } of edits) {
      const changes = transactionChanges(before, after);
      if (!Object.keys(changes).length) continue;
      batch.update(this.doc(before.id), { ...changes, updatedAt: serverTimestamp() });
      deltas.push(editEffects(before, after));
    }
    return deltas.length ? this.commit(batch, combineEffects(deltas)) : Promise.resolve(true);
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
    void this.commit(batch, combineEffects(txs.map(reverseEffects)));
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
    void this.commit(batch, combineEffects(txs.map((tx) => effects(tx))));
  }

  private doc(id: string): string {
    return `${this.path}/${id}`;
  }

  /**
   * Adds `increment()` for each non-zero balance change, then commits. Callers
   * don't wait for it; it resolves to whether it went through.
   */
  private commit(batch: Batch, deltas: ReadonlyMap<string, number>): Promise<boolean> {
    for (const [accountId, delta] of deltas) {
      if (delta !== 0) {
        batch.update(`${this.db.userPath}/accounts/${accountId}`, {
          currentBalance: increment(delta),
          updatedAt: serverTimestamp(),
        });
      }
    }
    // Not awaited: offline, a commit resolves only once the server confirms (§10).
    return batch.commit().then(
      () => true,
      (error) => {
        this.errors.report(error);
        return false;
      },
    );
  }
}

/** Fills the fields an older or Android-written document may lack. */
function toTransaction(doc: Doc): Transaction {
  const data = doc.data as Partial<Transaction>;
  return {
    ...data,
    id: doc.id,
    accountIds: data.accountIds ?? accountIdsOf(data as Transaction),
    tags: data.tags ?? [],
    attachments: data.attachments ?? [],
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    pending: doc.pending,
  } as Transaction;
}
