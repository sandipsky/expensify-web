import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { effects } from '../domain/balance';
import { Account } from '../models/account';
import { Transaction } from '../models/transaction';
import { LocalBatch, LocalDb, LocalDoc, increment, serverTimestamp } from './local-db';
import { WriteErrors } from './write-errors';

/** What a new account is written with; the repo adds the balance and audit fields. */
export type NewAccount = Omit<
  Account,
  'id' | 'currentBalance' | 'createdAt' | 'updatedAt' | 'pending'
>;

/** Fields an edit may change. `currentBalance` isn't one: it only moves by increments. */
export type AccountChanges = Partial<
  Pick<
    Account,
    'name' | 'type' | 'openingBalance' | 'creditLimit' | 'icon' | 'color' | 'includeInTotal'
  >
>;

/**
 * `users/{uid}/accounts` (§8). Writes return before they're confirmed and hand
 * failures to `WriteErrors`, so screens update from the local cache at once (NFR-03).
 */
@Injectable({ providedIn: 'root' })
export class AccountsRepo {
  private readonly db = inject(LocalDb);
  private readonly errors = inject(WriteErrors);
  private readonly path = `${this.db.userPath}/accounts`;

  /** Every account, archived ones too, by `sortOrder`. Accounts are few, so one listener serves the app. */
  watchAll(): Observable<Account[]> {
    return this.db
      .watch(this.path, { orderBy: [['sortOrder', 'asc']] })
      .pipe(map((docs) => docs.map(toAccount)));
  }

  /** Writes a new account whose current balance starts at its opening balance, and returns its ID. */
  create(account: NewAccount): string {
    const id = this.db.newId();
    this.commit(
      this.db.batch().set(this.doc(id), {
        ...account,
        currentBalance: account.openingBalance,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    return id;
  }

  /**
   * Writes only the fields passed, so another device's edits to other fields
   * survive (SYN-03). A new opening balance shifts the current balance by the
   * difference in the same write (ACC-03).
   */
  update(account: Account, changes: AccountChanges): void {
    const delta =
      changes.openingBalance === undefined ? 0 : changes.openingBalance - account.openingBalance;
    this.commit(
      this.db.batch().update(this.doc(account.id), {
        ...changes,
        ...(delta !== 0 ? { currentBalance: increment(delta) } : {}),
        updatedAt: serverTimestamp(),
      }),
    );
  }

  /** Archived accounts leave pickers, the dashboard and the total but keep their history (ACC-04). */
  setArchived(id: string, archived: boolean): void {
    this.commit(this.db.batch().update(this.doc(id), { archived, updatedAt: serverTimestamp() }));
  }

  /** Puts back an account deleted moments ago (Undo), under its old ID with its old fields. */
  restore(account: Account): void {
    const { id, pending: _pending, ...fields } = account;
    this.commit(this.db.batch().set(this.doc(id), { ...fields, updatedAt: serverTimestamp() }));
  }

  /**
   * Deletes the account and every transaction on it in one batch (ACC-05). The
   * other side of each transfer is reversed on the account it touched, so that
   * balance stays right. Firestore caps a batch at 500 writes, so the Firestore
   * version must chunk, keeping the account's own delete in the last chunk.
   */
  delete(accountId: string, transactions: readonly Transaction[]): void {
    const batch = this.db.batch();
    const reversals = new Map<string, number>();
    for (const tx of transactions) {
      batch.delete(`${this.db.userPath}/transactions/${tx.id}`);
      for (const [id, effect] of effects(tx)) {
        if (id !== accountId) reversals.set(id, (reversals.get(id) ?? 0) - effect);
      }
    }
    for (const [id, delta] of reversals) {
      if (delta !== 0) {
        batch.update(this.doc(id), {
          currentBalance: increment(delta),
          updatedAt: serverTimestamp(),
        });
      }
    }
    batch.delete(this.doc(accountId));
    this.commit(batch);
  }

  private doc(id: string): string {
    return `${this.path}/${id}`;
  }

  // Not awaited: offline, a commit resolves only once the server confirms (§10).
  private commit(batch: LocalBatch): void {
    batch.commit().catch((error) => this.errors.report(error));
  }
}

/** Fills the fields an older or Android-written document may lack. */
function toAccount(doc: LocalDoc): Account {
  const data = doc.data as Partial<Account>;
  return {
    ...data,
    id: doc.id,
    creditLimit: data.creditLimit ?? null,
    includeInTotal: data.includeInTotal ?? true,
    archived: data.archived ?? false,
    sortOrder: data.sortOrder ?? 0,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    pending: false,
  } as Account;
}
