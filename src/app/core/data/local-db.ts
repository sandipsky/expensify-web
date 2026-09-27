import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, distinctUntilChanged, map } from 'rxjs';
import { TimestampLike } from '../models/timestamp';

/*
 * Stand-in for Cloud Firestore until the Firebase SDK and sign-in land (M0). It keeps
 * Firestore's document paths and write semantics (atomic batches, increment(),
 * serverTimestamp(), auto IDs, undefined fields ignored) and persists to
 * localStorage, so the repos built on it can switch to the modular SDK without
 * their callers changing. Nothing syncs: the data stays in this browser.
 */

export type DocData = Record<string, unknown>;

/** A stored document. Documents a write didn't touch keep their identity. */
export interface LocalDoc {
  readonly id: string;
  readonly data: Readonly<DocData>;
}

export type WhereOp = '==' | '<=' | '>=' | 'array-contains';

export interface LocalQuery {
  where?: readonly (readonly [field: string, op: WhereOp, value: unknown])[];
  orderBy?: readonly (readonly [field: string, direction: 'asc' | 'desc'])[];
  limit?: number;
}

export class LocalTimestamp implements TimestampLike {
  constructor(private readonly ms: number) {}

  toMillis(): number {
    return this.ms;
  }

  toJSON(): { __ts: number } {
    return { __ts: this.ms };
  }
}

class Increment {
  constructor(readonly by: number) {}
}

const SERVER_TIMESTAMP = Symbol('serverTimestamp');

/** Like Firestore's `increment()`: adds to the stored number (or to 0) when the batch applies. */
export function increment(by: number): unknown {
  return new Increment(by);
}

/** Like Firestore's `serverTimestamp()`: becomes the commit time. */
export function serverTimestamp(): unknown {
  return SERVER_TIMESTAMP;
}

type Write =
  | { kind: 'set'; path: string; data: DocData }
  | { kind: 'update'; path: string; data: DocData }
  | { kind: 'delete'; path: string };

/** Like Firestore's `WriteBatch`: every write applies, or none does. */
export class LocalBatch {
  private readonly writes: Write[] = [];
  private committed = false;

  constructor(private readonly apply: (writes: readonly Write[]) => void) {}

  set(path: string, data: DocData): this {
    this.writes.push({ kind: 'set', path, data });
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

const STORAGE_KEY = 'expensify.local-db.v1';
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

@Injectable({ providedIn: 'root' })
export class LocalDb {
  /** Root of the current user's data (`users/{uid}`). Fixed until there's sign-in. */
  readonly userPath = 'users/local';

  private readonly docs$ = new BehaviorSubject<ReadonlyMap<string, LocalDoc>>(load());

  constructor() {
    // Another tab wrote: take its changes, as Firestore's multi-tab cache would.
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) this.docs$.next(load());
    });
  }

  /** A 20-character random ID, like Firestore's auto IDs; works offline. */
  newId(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join('');
  }

  batch(): LocalBatch {
    return new LocalBatch((writes) => this.apply(writes));
  }

  /** Live query over one collection, like `onSnapshot`. Emits again only when the result changes. */
  watch(collectionPath: string, query: LocalQuery = {}): Observable<LocalDoc[]> {
    return this.docs$.pipe(
      map((docs) => runQuery(docs, collectionPath, query)),
      distinctUntilChanged((a, b) => a.length === b.length && a.every((doc, i) => doc === b[i])),
    );
  }

  /** One-off query, like `getDocs`. */
  get(collectionPath: string, query: LocalQuery = {}): Promise<LocalDoc[]> {
    return Promise.resolve(runQuery(this.docs$.value, collectionPath, query));
  }

  private apply(writes: readonly Write[]): void {
    const next = new Map(this.docs$.value);
    const now = new LocalTimestamp(Date.now());
    for (const write of writes) {
      if (write.kind === 'delete') {
        next.delete(write.path);
        continue;
      }
      const existing = next.get(write.path)?.data;
      if (write.kind === 'update' && !existing) {
        throw new Error(`No document to update: ${write.path}`);
      }
      const data: DocData = write.kind === 'update' ? { ...existing } : {};
      for (const [field, value] of Object.entries(write.data)) {
        if (value === undefined) continue;
        if (value instanceof Increment) {
          const previous = existing?.[field];
          data[field] = (typeof previous === 'number' ? previous : 0) + value.by;
        } else {
          data[field] = value === SERVER_TIMESTAMP ? now : value;
        }
      }
      next.set(write.path, { id: idOf(write.path), data });
    }
    save(next);
    this.docs$.next(next);
  }
}

function idOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function runQuery(
  docs: ReadonlyMap<string, LocalDoc>,
  collectionPath: string,
  query: LocalQuery,
): LocalDoc[] {
  const prefix = `${collectionPath}/`;
  let rows: LocalDoc[] = [];
  for (const [path, doc] of docs) {
    if (path.startsWith(prefix) && !path.includes('/', prefix.length)) rows.push(doc);
  }
  for (const [field, op, value] of query.where ?? []) {
    rows = rows.filter((doc) => matches(doc.data[field], op, value));
  }
  const orderBy = query.orderBy ?? [];
  if (orderBy.length) {
    // Firestore breaks ties by document ID, in the direction of the last orderBy.
    const tieDirection = orderBy[orderBy.length - 1][1];
    rows.sort((a, b) => {
      for (const [field, direction] of orderBy) {
        const c = compare(a.data[field], b.data[field]);
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
  return 0;
}

function load(): Map<string, LocalDoc> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const entries = JSON.parse(raw, revive) as [string, DocData][];
    return new Map(entries.map(([path, data]) => [path, { id: idOf(path), data }]));
  } catch {
    return new Map();
  }
}

function save(docs: ReadonlyMap<string, LocalDoc>): void {
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
    if (Object.keys(value).length === 1 && typeof ts === 'number') return new LocalTimestamp(ts);
  }
  return value;
}
