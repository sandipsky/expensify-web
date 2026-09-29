import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, distinctUntilChanged, map, of } from 'rxjs';
import type { Batch, Db, Doc, DocData, DocSnapshot, Query, SetOptions, Tx, WhereOp } from './db';
import { Increment, MillisTimestamp, SERVER_TIMESTAMP, randomId } from './fields';

// The names the specs know these by.
export { increment, serverTimestamp, timestampFromMillis } from './fields';
export { MillisTimestamp as LocalTimestamp };
export type { Doc as LocalDoc, DocData, Query as LocalQuery, WhereOp };

/*
 * Stand-in for Cloud Firestore that keeps its document paths and write
 * semantics (atomic batches, transactions, increment(), serverTimestamp(),
 * auto IDs, undefined fields ignored) in localStorage. The unit tests run the
 * repos on it, since they were written against `Db` and can't tell the
 * difference; the running app uses `FirestoreDb`. Nothing syncs: the data
 * stays in this browser, under the one fixed user `users/local`.
 */

type Write =
  | { kind: 'set'; path: string; data: DocData; merge?: boolean }
  | { kind: 'update'; path: string; data: DocData }
  | { kind: 'delete'; path: string };

/** Like Firestore's `WriteBatch`: every write applies, or none does. */
export class LocalBatch implements Batch {
  private readonly writes: Write[] = [];
  private committed = false;

  constructor(private readonly apply: (writes: readonly Write[]) => void) {}

  set(path: string, data: DocData, options: SetOptions = {}): this {
    this.writes.push({ kind: 'set', path, data, merge: options.merge });
    return this;
  }

  update(path: string, data: DocData): this {
    this.writes.push({ kind: 'update', path, data });
    return this;
  }

  delete(path: string): this {
    this.writes.push({ kind: 'delete', path });
    return this;
  }

  /** Rejects without applying anything if an update targets a missing document. */
  commit(): Promise<void> {
    if (this.committed) return Promise.reject(new Error('A batch can only be committed once.'));
    this.committed = true;
    try {
      this.apply(this.writes);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }
}

/**
 * Like Firestore's `Transaction`: reads see the latest data, and the writes
 * apply together only if nothing read changed in the meantime; otherwise
 * `runTransaction` runs the function again. Unlike Firestore's, it also works
 * offline, since everything here is local.
 */
export class LocalTransaction implements Tx {
  /** What each read saw, to detect a concurrent change before committing. */
  readonly reads = new Map<string, Doc | null>();
  readonly writes: Write[] = [];

  constructor(private readonly docs: () => ReadonlyMap<string, Doc>) {}

  get(path: string): Promise<Doc | null> {
    const doc = this.docs().get(path) ?? null;
    if (!this.reads.has(path)) this.reads.set(path, doc);
    return Promise.resolve(doc);
  }

  set(path: string, data: DocData, options: SetOptions = {}): this {
    this.writes.push({ kind: 'set', path, data, merge: options.merge });
    return this;
  }

  update(path: string, data: DocData): this {
    this.writes.push({ kind: 'update', path, data });
    return this;
  }

  delete(path: string): this {
    this.writes.push({ kind: 'delete', path });
    return this;
  }
}

/** Like Firestore's default: give up after this many runs that kept seeing changes. */
const TRANSACTION_ATTEMPTS = 5;

const STORAGE_KEY = 'expensify.local-db.v1';

/** The one user the local database holds. */
export const LOCAL_UID = 'local';

@Injectable({ providedIn: 'root' })
export class LocalDb implements Db {
  readonly uid$: Observable<string | null> = of(LOCAL_UID);
  readonly userPath = `users/${LOCAL_UID}`;

  private readonly docs$ = new BehaviorSubject<ReadonlyMap<string, Doc>>(load());

  constructor() {
    // Another tab wrote: take its changes, as Firestore's multi-tab cache would.
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) this.docs$.next(load());
    });
  }

  newId(): string {
    return randomId();
  }

  batch(): LocalBatch {
    return new LocalBatch((writes) => this.apply(writes));
  }

  async runTransaction<T>(update: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const tx = new LocalTransaction(() => this.docs$.value);
      const result = await update(tx);
      const current = this.docs$.value;
      const changed = [...tx.reads].some(([path, doc]) => (current.get(path) ?? null) !== doc);
      if (!changed) {
        if (tx.writes.length) this.apply(tx.writes);
        return result;
      }
      if (attempt >= TRANSACTION_ATTEMPTS) {
        throw new Error('Transaction failed: the documents it read kept changing.');
      }
    }
  }

  /** Emits again only when the result changes. */
  watch(collectionPath: string, query: Query = {}): Observable<Doc[]> {
    return this.docs$.pipe(
      map((docs) => runQuery(docs, collectionPath, query)),
      distinctUntilChanged((a, b) => a.length === b.length && a.every((doc, i) => doc === b[i])),
    );
  }

  /** Nothing here is ever only from a cache: a missing document is missing. */
  watchDoc(path: string): Observable<DocSnapshot> {
    return this.docs$.pipe(
      map((docs) => docs.get(path) ?? null),
      distinctUntilChanged(),
      map((doc) => ({ doc, fromCache: false })),
    );
  }

  get(collectionPath: string, query: Query = {}): Promise<Doc[]> {
    return Promise.resolve(runQuery(this.docs$.value, collectionPath, query));
  }

  getDoc(path: string): Promise<Doc | null> {
    return Promise.resolve(this.docs$.value.get(path) ?? null);
  }

  private apply(writes: readonly Write[]): void {
    const next = new Map(this.docs$.value);
    const now = new MillisTimestamp(Date.now());
    for (const write of writes) {
      if (write.kind === 'delete') {
        next.delete(write.path);
        continue;
      }
      const existing = next.get(write.path)?.data;
      if (write.kind === 'update' && !existing) {
        throw new Error(`No document to update: ${write.path}`);
      }
      const merge = write.kind === 'set' && write.merge === true;
      const data: DocData = write.kind === 'update' || merge ? { ...existing } : {};
      for (const [path, value] of fieldsOf(write.data, write.kind === 'update', merge)) {
        if (value instanceof Increment) {
          const previous = valueAt(existing, path);
          setAt(data, path, (typeof previous === 'number' ? previous : 0) + value.by);
        } else {
          setAt(data, path, value === SERVER_TIMESTAMP ? now : value);
        }
      }
      next.set(write.path, { id: idOf(write.path), data, pending: false });
    }
    save(next);
    this.docs$.next(next);
  }
}

/**
 * The field paths a write sets. An update's `a.b` names a nested field, as in
 * Firestore; a set's keys are plain names, and a merging set reaches into maps,
 * so `{ prefs: { a: 1 } }` changes `prefs.a` and keeps the rest of `prefs`.
 */
function fieldsOf(data: DocData, dotted: boolean, merge: boolean): [string[], unknown][] {
  const fields: [string[], unknown][] = [];
  const visit = (map: DocData, prefix: string[]) => {
    for (const [key, value] of Object.entries(map)) {
      if (value === undefined) continue;
      const path = prefix.length ? [...prefix, key] : dotted ? key.split('.') : [key];
      if (merge && isMap(value) && Object.keys(value).length) visit(value, path);
      else fields.push([path, value]);
    }
  };
  visit(data, []);
  return fields;
}

/** A nested map, as opposed to a value such as a timestamp, an increment or an array. */
function isMap(value: unknown): value is DocData {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Increment) &&
    !(value instanceof MillisTimestamp)
  );
}

function idOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** The value at a field path such as `['template', 'categoryId']`, or undefined. */
function valueAt(data: Readonly<DocData> | undefined, path: readonly string[]): unknown {
  let value: unknown = data;
  for (const key of path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    value = (value as DocData)[key];
  }
  return value;
}

/** Sets a field path in `data`, copying the maps along it so stored documents stay unchanged. */
function setAt(data: DocData, path: readonly string[], value: unknown): void {
  const [key, ...rest] = path;
  if (!rest.length) {
    data[key] = value;
    return;
  }
  const current = data[key];
  const child: DocData =
    current && typeof current === 'object' && !Array.isArray(current)
      ? { ...(current as DocData) }
      : {};
  setAt(child, rest, value);
  data[key] = child;
}

function runQuery(docs: ReadonlyMap<string, Doc>, collectionPath: string, query: Query): Doc[] {
  const prefix = `${collectionPath}/`;
  let rows: Doc[] = [];
  for (const [path, doc] of docs) {
    if (path.startsWith(prefix) && !path.includes('/', prefix.length)) rows.push(doc);
  }
  // Fields may be paths into maps, such as `template.categoryId`, as in Firestore.
  const at = (doc: Doc, field: string) => valueAt(doc.data, field.split('.'));
  for (const [field, op, value] of query.where ?? []) {
    rows = rows.filter((doc) => matches(at(doc, field), op, value));
  }
  const orderBy = query.orderBy ?? [];
  if (orderBy.length) {
    // Firestore breaks ties by document ID, in the direction of the last orderBy.
    const tieDirection = orderBy[orderBy.length - 1][1];
    rows.sort((a, b) => {
      for (const [field, direction] of orderBy) {
        const c = compare(at(a, field), at(b, field));
        if (c) return direction === 'desc' ? -c : c;
      }
      const c = compare(a.id, b.id);
      return tieDirection === 'desc' ? -c : c;
    });
  }
  return query.limit === undefined ? rows : rows.slice(0, query.limit);
}

function matches(actual: unknown, op: WhereOp, expected: unknown): boolean {
  switch (op) {
    case '==':
      return actual === expected;
    case 'array-contains':
      return Array.isArray(actual) && actual.includes(expected);
    case '<=':
      return typeof actual === typeof expected && compare(actual, expected) <= 0;
    case '>=':
      return typeof actual === typeof expected && compare(actual, expected) >= 0;
  }
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return Math.sign(a - b);
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (a instanceof MillisTimestamp && b instanceof MillisTimestamp) {
    return Math.sign(a.toMillis() - b.toMillis());
  }
  return 0;
}

function load(): Map<string, Doc> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const entries = JSON.parse(raw, revive) as [string, DocData][];
    return new Map(entries.map(([path, data]) => [path, { id: idOf(path), data, pending: false }]));
  } catch {
    return new Map();
  }
}

function save(docs: ReadonlyMap<string, Doc>): void {
  try {
    const entries = [...docs].map(([path, doc]) => [path, doc.data]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage blocked or full: keep working from memory for this session.
  }
}

function revive(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const ts = (value as { __ts?: unknown }).__ts;
    if (Object.keys(value).length === 1 && typeof ts === 'number') return new MillisTimestamp(ts);
  }
  return value;
}
