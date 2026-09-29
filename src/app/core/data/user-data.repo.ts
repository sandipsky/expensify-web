import { Injectable, inject } from '@angular/core';
import { attachmentsOf } from '../domain/attachments';
import { combineEffects, reverseEffects } from '../domain/balance';
import { Transaction } from '../models/transaction';
import { ChunkedWriter, MAX_BATCH_WRITES } from './chunked-writer';
import { Batch, Db, increment, serverTimestamp } from './db';
import { LocalBucket } from './local-bucket';
import { ReceiptsRepo } from './receipts.repo';
import { UsersRepo } from './users.repo';

/** Every collection under `users/{uid}` (§8), in the order deleting the account removes them. */
export const USER_COLLECTIONS = [
  'transactions',
  'recurringRules',
  'budgets',
  'accounts',
  'categories',
  'devices',
  'goals',
] as const;

/**
 * Bulk changes across the user's data from Settings: deleting every
 * transaction or the whole account (SET-04), and relabelling amounts with a
 * new base currency (SET-01). They read whole collections once, then write in
 * batches under Firestore's cap. Each resolves to whether every batch went
 * through; failures are logged without their documents (NFR-13).
 */
@Injectable({ providedIn: 'root' })
export class UserDataRepo {
  private readonly db = inject(Db);
  private readonly bucket = inject(LocalBucket);
  private readonly receipts = inject(ReceiptsRepo);
  private readonly users = inject(UsersRepo);

  /** How many transactions there are (with Firestore, a `count()` aggregation). */
  async countTransactions(): Promise<number> {
    return (await this.db.get(this.collection('transactions'))).length;
  }

  /**
   * Deletes every transaction (SET-04). Each batch takes its own entries'
   * effects off the balances with `increment()`, so every account ends at its
   * opening balance (§4) and a batch that fails leaves the balances matching
   * what's left. Receipt files go once their entries' deletes went through.
   * Rules, budgets, accounts and categories stay.
   */
  async deleteAllTransactions(): Promise<boolean> {
    const docs = await this.db.get(this.collection('transactions'));
    const accounts = new Set((await this.db.get(this.collection('accounts'))).map((d) => d.id));
    const txs = docs.map((doc) => ({ ...doc.data, id: doc.id }) as Transaction);
    const size = Math.max(50, MAX_BATCH_WRITES - accounts.size);
    const commits: Promise<boolean>[] = [];
    for (let i = 0; i < txs.length; i += size) {
      const chunk = txs.slice(i, i + size);
      const batch = this.db.batch();
      for (const tx of chunk) batch.delete(this.path('transactions', tx.id));
      for (const [accountId, delta] of combineEffects(chunk.map(reverseEffects))) {
        // An entry on an account that's gone has no balance left to fix.
        if (delta === 0 || !accounts.has(accountId)) continue;
        batch.update(this.path('accounts', accountId), {
          currentBalance: increment(delta),
          updatedAt: serverTimestamp(),
        });
      }
      commits.push(
        this.commit(batch).then((ok) => {
          if (ok) this.receipts.delete(attachmentsOf(chunk));
          return ok;
        }),
      );
    }
    return (await Promise.all(commits)).every(Boolean);
  }

  /**
   * Relabels every account and transaction with the new base currency (SET-01).
   * Amounts keep their integer minor units, so this is only right between
   * currencies with the same decimal places; the caller checks that.
   */
  async relabelCurrency(currency: string): Promise<boolean> {
    const commits: Promise<boolean>[] = [];
    const writer = new ChunkedWriter(this.db, (batch) => commits.push(this.commit(batch)));
    for (const name of ['accounts', 'transactions'] as const) {
      for (const doc of await this.db.get(this.collection(name))) {
        if (doc.data['currency'] === currency) continue;
        writer.add((b) =>
          b.update(this.path(name, doc.id), { currency, updatedAt: serverTimestamp() }),
        );
      }
    }
    writer.flush();
    return (await Promise.all(commits)).every(Boolean);
  }

  /**
   * Deletes the account's data (SET-04), as §12 has the client do until the
   * deleteAccount Function exists: every collection in batches, then the
   * receipt files, then the profile document last, since the Security Rules
   * need it active until then. Deleting the sign-in itself joins this in M0.
   * Stops before the profile if anything failed, so it can be run again.
   */
  async deleteAll(): Promise<boolean> {
    const commits: Promise<boolean>[] = [];
    const writer = new ChunkedWriter(this.db, (batch) => commits.push(this.commit(batch)));
    for (const name of USER_COLLECTIONS) {
      for (const doc of await this.db.get(this.collection(name))) {
        writer.add((b) => b.delete(this.path(name, doc.id)));
      }
    }
    writer.flush();
    if (!(await Promise.all(commits)).every(Boolean)) return false;
    try {
      const files = await this.bucket.list(`${this.db.userPath}/receipts`);
      await Promise.all(files.map((path) => this.bucket.delete(path)));
      await this.users.delete();
      return true;
    } catch (error) {
      console.error('[account delete failed]', error);
      return false;
    }
  }

  private collection(name: string): string {
    return `${this.db.userPath}/${name}`;
  }

  private path(name: string, id: string): string {
    return `${this.collection(name)}/${id}`;
  }

  private commit(batch: Batch): Promise<boolean> {
    return batch.commit().then(
      () => true,
      (error) => {
        console.error('[bulk write failed]', error);
        return false;
      },
    );
  }
}
