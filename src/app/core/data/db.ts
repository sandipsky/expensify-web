import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { LocalDb } from './local-db';

export {
  Increment,
  MillisTimestamp,
  SERVER_TIMESTAMP,
  increment,
  randomId,
  serverTimestamp,
  timestampFromMillis,
} from './fields';

/*
 * The database the repos are written against: Firestore's document paths and
 * write semantics (atomic batches, transactions, `increment()`,
 * `serverTimestamp()`, auto IDs, undefined fields ignored), scoped to the
 * signed-in user's `users/{uid}`. `FirestoreDb` (core/firebase) is the real
 * thing and `app.config.ts` provides it for the running app. `LocalDb` keeps
 * the same semantics in localStorage for the unit tests, which is why it is
 * the default provider here: a spec never touches Firebase.
 */

export type DocData = Record<string, unknown>;

/** A stored document. Documents a write didn't touch keep their identity. */
export interface Doc {
  readonly id: string;
  readonly data: Readonly<DocData>;
  /** The document has writes the server hasn't confirmed yet (SYN-04). */
  readonly pending: boolean;
}

/** One document as a listener sees it, with whether the answer came from the cache alone. */
export interface DocSnapshot {
  readonly doc: Doc | null;
  /**
   * True while the SDK has answered from its cache without the server having
   * confirmed. A missing document is only known to be missing once this is false.
   */
  readonly fromCache: boolean;
}

export type WhereOp = '==' | '<=' | '>=' | 'array-contains';

export interface Query {
  where?: readonly (readonly [field: string, op: WhereOp, value: unknown])[];
  orderBy?: readonly (readonly [field: string, direction: 'asc' | 'desc'])[];
  limit?: number;
}

/** Like Firestore's `SetOptions`: `merge` keeps the fields the write doesn't name. */
export interface SetOptions {
  merge?: boolean;
}

/** Like Firestore's `WriteBatch`: every write applies, or none does. */
export interface Batch {
  set(path: string, data: DocData, options?: SetOptions): this;
  update(path: string, data: DocData): this;
  delete(path: string): this;
  /** Offline, resolves only once the server confirms, so the UI never awaits it (NFR-03). */
  commit(): Promise<void>;
}

/** Like Firestore's `Transaction`: reads first, then writes that apply together. */
export interface Tx {
  get(path: string): Promise<Doc | null>;
  set(path: string, data: DocData, options?: SetOptions): this;
  update(path: string, data: DocData): this;
  delete(path: string): this;
}

@Injectable({ providedIn: 'root', useFactory: () => inject(LocalDb) })
export abstract class Db {
  /** The signed-in user's ID, live: `null` while signed out. */
  abstract readonly uid$: Observable<string | null>;

  /** Root of the signed-in user's data, `users/{uid}`. Throws while signed out. */
  abstract readonly userPath: string;

  /** An ID for a document not written yet. */
  abstract newId(): string;

  abstract batch(): Batch;

  /**
   * Like Firestore's `runTransaction`: runs `update`, then applies its writes
   * at once, unless a document it read changed while it ran, in which case it
   * runs again. Resolves to what `update` returned; rejects, applying nothing,
   * if `update` throws or an update targets a missing document.
   */
  abstract runTransaction<T>(update: (tx: Tx) => Promise<T>): Promise<T>;

  /** Live query over one collection, like `onSnapshot`. */
  abstract watch(collectionPath: string, query?: Query): Observable<Doc[]>;

  /** Live view of one document, like `onSnapshot` on a doc. */
  abstract watchDoc(path: string): Observable<DocSnapshot>;

  /** One-off query, like `getDocs`. */
  abstract get(collectionPath: string, query?: Query): Promise<Doc[]>;

  /** One-off read of a document, like `getDoc`; `null` when it doesn't exist. */
  abstract getDoc(path: string): Promise<Doc | null>;
}
