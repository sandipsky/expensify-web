import { Injectable, inject } from '@angular/core';
import { combineEffects, effects } from '../domain/balance';
import {
  BACKUP_COLLECTIONS,
  Backup,
  BackupCollection,
  BackupDoc,
  TIMESTAMP_FIELDS,
} from '../domain/backup';
import { accountIdsOf } from '../domain/transactions';
import { TimestampLike } from '../models/timestamp';
import { Transaction } from '../models/transaction';
import { ChunkedWriter, MAX_BATCH_WRITES } from './chunked-writer';
import { DocData, Batch, Db, increment, serverTimestamp, timestampFromMillis } from './db';
import { WriteErrors } from './write-errors';

/** What a restore leaves out of a transaction: receipt files aren't in a backup. */
const NOT_RESTORED = ['attachments', 'pending'];

/**
 * Reads and restores whole collections under `users/{uid}` for the JSON backup
 * (DAT-03, DAT-04, Appendix C). Reading is one-off `getDocs` per collection;
 * restoring writes chunked batches that aren't awaited (NFR-03).
 */
@Injectable({ providedIn: 'root' })
export class BackupRepo {
  private readonly db = inject(Db);
  private readonly errors = inject(WriteErrors);

  /** Every document of the backed-up collections, fields as stored, timestamps as ISO strings. */
  async read(): Promise<Record<BackupCollection, BackupDoc[]>> {
    const result = {} as Record<BackupCollection, BackupDoc[]>;
    for (const name of BACKUP_COLLECTIONS) {
      const docs = await this.db.get(this.collection(name));
      result[name] = docs.map((doc) => ({ id: doc.id, ...toFile(doc.data) }));
    }
    return result;
  }

  /**
   * Whether anything that holds or plans money exists, which a restore needs
   * not to (DAT-04). One document per collection at most is read.
   */
  async hasData(): Promise<boolean> {
    for (const name of ['accounts', 'transactions', 'budgets', 'recurringRules'] as const) {
      if ((await this.db.get(this.collection(name), { limit: 1 })).length) return true;
    }
    return false;
  }

  /**
   * Writes a backup into an empty account (DAT-04), keeping every ID, so
   * seeded categories and recurring occurrences keep theirs (§8 IDs). The
   * backup's categories replace the current ones. Each account starts at its
   * opening balance and its transactions' increments follow in the batches
   * that write them, so the balances come out as §4 defines them, whatever the
   * file's `currentBalance` said. Rules go last, so an automatic rule's
   * catch-up (REC-06) finds the entries it already made. Resolves to whether
   * every batch went through.
   */
  async restore(backup: Backup): Promise<boolean> {
    const existing = await this.db.get(this.collection('categories'));
    const keep = new Set(backup.categories.map((c) => c.id));
    const commits: Promise<boolean>[] = [];
    const writer = new ChunkedWriter(this.db, (batch) => commits.push(this.commit(batch)));

    for (const doc of existing) {
      if (!keep.has(doc.id)) writer.add((b) => b.delete(this.path('categories', doc.id)));
    }
    for (const doc of backup.categories) writer.set(this.path('categories', doc.id), fromFile(doc));
    for (const doc of backup.accounts) {
      const data = fromFile(doc);
      writer.set(this.path('accounts', doc.id), {
        ...data,
        currentBalance: data['openingBalance'],
      });
    }
    for (const doc of backup.budgets) writer.set(this.path('budgets', doc.id), fromFile(doc));
    writer.flush();

    // Whole transactions with their increments per batch, so each batch keeps balances right.
    const size = Math.max(50, MAX_BATCH_WRITES - backup.accounts.length);
    for (let i = 0; i < backup.transactions.length; i += size) {
      const chunk = backup.transactions.slice(i, i + size);
      const batch = this.db.batch();
      const deltas: Map<string, number>[] = [];
      for (const doc of chunk) {
        const data = fromFile(doc);
        for (const field of NOT_RESTORED) delete data[field];
        const tx = data as unknown as Transaction;
        batch.set(this.path('transactions', doc.id), { ...data, accountIds: accountIdsOf(tx) });
        deltas.push(effects(tx));
      }
      for (const [accountId, delta] of combineEffects(deltas)) {
        if (delta !== 0) {
          batch.update(this.path('accounts', accountId), {
            currentBalance: increment(delta),
            updatedAt: serverTimestamp(),
          });
        }
      }
      commits.push(this.commit(batch));
    }

    for (const doc of backup.recurringRules) {
      writer.set(this.path('recurringRules', doc.id), fromFile(doc));
    }
    writer.flush();
    return (await Promise.all(commits)).every(Boolean);
  }

  private collection(name: BackupCollection): string {
    return `${this.db.userPath}/${name}`;
  }

  private path(name: BackupCollection, id: string): string {
    return `${this.collection(name)}/${id}`;
  }

  // Not awaited by the UI: offline, a commit resolves only once the server confirms (§10).
  private commit(batch: Batch): Promise<boolean> {
    return batch.commit().then(
      () => true,
      (error) => {
        this.errors.report(error);
        return false;
      },
    );
  }
}

function isTimestamp(value: unknown): value is TimestampLike {
  return !!value && typeof (value as TimestampLike).toMillis === 'function';
}

/** A stored document's fields for the file: timestamps as ISO 8601 strings. */
function toFile(data: Readonly<DocData>): DocData {
  const result: DocData = {};
  for (const [field, value] of Object.entries(data)) {
    result[field] = isTimestamp(value) ? new Date(value.toMillis()).toISOString() : value;
  }
  return result;
}

/**
 * A backed-up document's fields to write back: its ID dropped, `createdAt`
 * kept as it was (entries sort by it within a day, §10) and `updatedAt` set to
 * now, as every write sets it.
 */
function fromFile(doc: BackupDoc): DocData {
  const { id: _id, ...fields } = doc;
  const data: DocData = { ...fields };
  for (const field of TIMESTAMP_FIELDS) {
    const ms = typeof data[field] === 'string' ? Date.parse(data[field] as string) : NaN;
    data[field] = Number.isFinite(ms) ? timestampFromMillis(ms) : serverTimestamp();
  }
  data['updatedAt'] = serverTimestamp();
  return data;
}
