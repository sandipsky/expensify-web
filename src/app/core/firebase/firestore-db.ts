import { Injectable } from '@angular/core';
import { onAuthStateChanged } from 'firebase/auth';
import type {
  DocumentSnapshot,
  Firestore,
  QueryConstraint,
  Transaction,
  WriteBatch,
} from 'firebase/firestore';
import { Observable, defer, distinctUntilChanged, of, shareReplay, switchMap } from 'rxjs';
import {
  Batch,
  Db,
  Doc,
  DocData,
  DocSnapshot,
  Increment,
  MillisTimestamp,
  Query,
  SERVER_TIMESTAMP,
  SetOptions,
  Tx,
  randomId,
} from '../data/db';
import {
  FirestoreModule,
  FirestoreServices,
  firebase,
  isFirebaseConfigured,
  loadFirestore,
} from './firebase';

/**
 * `Db` on Cloud Firestore (§10): the modular SDK behind the repos' paths and
 * batches. The SDK loads on first use (`loadFirestore`), so every call waits
 * on that once. Listeners include metadata changes, so `Doc.pending` follows
 * `hasPendingWrites` for the unsynced marker (SYN-04), and a document snapshot
 * says whether it came from the cache alone, which sign-in needs before it
 * creates a profile. A listener that fails, as one does when the rules refuse
 * it, logs its error code and stops rather than throwing into the screen.
 */
@Injectable()
export class FirestoreDb implements Db {
  readonly uid$: Observable<string | null> = isFirebaseConfigured()
    ? new Observable<string | null>((subscriber) =>
        onAuthStateChanged(firebase().auth, (user) => subscriber.next(user?.uid ?? null)),
      ).pipe(distinctUntilChanged(), shareReplay({ bufferSize: 1, refCount: false }))
    : of(null);

  get userPath(): string {
    const uid = firebase().auth.currentUser?.uid;
    if (!uid) throw new Error('Not signed in.');
    return `users/${uid}`;
  }

  newId(): string {
    return randomId();
  }

  batch(): Batch {
    return new FirestoreBatch(loadFirestore());
  }

  async runTransaction<T>(update: (tx: Tx) => Promise<T>): Promise<T> {
    const { db, fs } = await loadFirestore();
    return fs.runTransaction(db, (transaction) => update(new FirestoreTx(db, fs, transaction)));
  }

  watch(collectionPath: string, q: Query = {}): Observable<Doc[]> {
    return defer(loadFirestore).pipe(
      switchMap(
        ({ db, fs }) =>
          new Observable<Doc[]>((subscriber) =>
            fs.onSnapshot(
              fs.query(fs.collection(db, collectionPath), ...constraints(fs, q)),
              { includeMetadataChanges: true },
              (snapshot) => subscriber.next(snapshot.docs.map(toDoc)),
              (error) => {
                logListenerError(collectionPath, error);
                subscriber.complete();
              },
            ),
          ),
      ),
    );
  }

  watchDoc(path: string): Observable<DocSnapshot> {
    return defer(loadFirestore).pipe(
      switchMap(
        ({ db, fs }) =>
          new Observable<DocSnapshot>((subscriber) =>
            fs.onSnapshot(
              fs.doc(db, path),
              { includeMetadataChanges: true },
              (snapshot) =>
                subscriber.next({
                  doc: snapshot.exists() ? toDoc(snapshot) : null,
                  fromCache: snapshot.metadata.fromCache,
                }),
              (error) => {
                logListenerError(path, error);
                subscriber.complete();
              },
            ),
          ),
      ),
    );
  }

  async get(collectionPath: string, q: Query = {}): Promise<Doc[]> {
    const { db, fs } = await loadFirestore();
    const snapshot = await fs.getDocs(
      fs.query(fs.collection(db, collectionPath), ...constraints(fs, q)),
    );
    return snapshot.docs.map(toDoc);
  }

  async getDoc(path: string): Promise<Doc | null> {
    const { db, fs } = await loadFirestore();
    const snapshot = await fs.getDoc(fs.doc(db, path));
    return snapshot.exists() ? toDoc(snapshot) : null;
  }
}

type Write = (db: Firestore, fs: FirestoreModule, batch: WriteBatch) => void;

/** Collects writes and commits them once the SDK is there; the same atomic batch. */
class FirestoreBatch implements Batch {
  private readonly writes: Write[] = [];

  constructor(private readonly loaded: Promise<FirestoreServices>) {}

  set(path: string, data: DocData, options: SetOptions = {}): this {
    this.writes.push((db, fs, batch) =>
      batch.set(fs.doc(db, path), toFirestore(fs, data) as DocData, {
        merge: options.merge === true,
      }),
    );
    return this;
  }

  update(path: string, data: DocData): this {
    this.writes.push((db, fs, batch) =>
      batch.update(fs.doc(db, path), toFirestore(fs, data) as DocData),
    );
    return this;
  }

  delete(path: string): this {
    this.writes.push((db, fs, batch) => batch.delete(fs.doc(db, path)));
    return this;
  }

  async commit(): Promise<void> {
    const { db, fs } = await this.loaded;
    const batch = fs.writeBatch(db);
    for (const write of this.writes) write(db, fs, batch);
    await batch.commit();
  }
}

class FirestoreTx implements Tx {
  constructor(
    private readonly db: Firestore,
    private readonly fs: FirestoreModule,
    private readonly transaction: Transaction,
  ) {}

  async get(path: string): Promise<Doc | null> {
    const snapshot = await this.transaction.get(this.fs.doc(this.db, path));
    return snapshot.exists() ? toDoc(snapshot) : null;
  }

  set(path: string, data: DocData, options: SetOptions = {}): this {
    this.transaction.set(this.fs.doc(this.db, path), toFirestore(this.fs, data) as DocData, {
      merge: options.merge === true,
    });
    return this;
  }

  update(path: string, data: DocData): this {
    this.transaction.update(this.fs.doc(this.db, path), toFirestore(this.fs, data) as DocData);
    return this;
  }

  delete(path: string): this {
    this.transaction.delete(this.fs.doc(this.db, path));
    return this;
  }
}

function constraints(fs: FirestoreModule, q: Query): QueryConstraint[] {
  return [
    ...(q.where ?? []).map(([field, op, value]) => fs.where(field, op, value)),
    ...(q.orderBy ?? []).map(([field, direction]) => fs.orderBy(field, direction)),
    ...(q.limit === undefined ? [] : [fs.limit(q.limit)]),
  ];
}

function toDoc(snapshot: DocumentSnapshot): Doc {
  return {
    id: snapshot.id,
    data: snapshot.data() ?? {},
    pending: snapshot.metadata.hasPendingWrites,
  };
}

/** The repos' write markers as the SDK's own values, through maps and arrays. */
function toFirestore(fs: FirestoreModule, value: unknown): unknown {
  if (value instanceof Increment) return fs.increment(value.by);
  if (value === SERVER_TIMESTAMP) return fs.serverTimestamp();
  if (value instanceof MillisTimestamp) return fs.Timestamp.fromMillis(value.toMillis());
  if (Array.isArray(value)) return value.map((item) => toFirestore(fs, item));
  if (isPlainObject(value)) {
    const out: DocData = {};
    for (const [key, field] of Object.entries(value)) out[key] = toFirestore(fs, field);
    return out;
  }
  return value;
}

/** A map to walk into, as opposed to a `Timestamp`, `FieldValue` or other SDK value. */
function isPlainObject(value: unknown): value is DocData {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** The path and code only: never a document's contents (NFR-13). */
function logListenerError(path: string, error: { code?: string }): void {
  console.error('[listener failed]', path, error.code ?? error);
}
