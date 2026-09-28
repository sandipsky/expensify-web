import { Injectable } from '@angular/core';

/*
 * Stand-in for Cloud Storage until the Firebase SDK lands (M0), as LocalDb is
 * for Firestore. Files are kept by their Storage path (§9 storage.rules) in this
 * browser's IndexedDB, which holds blobs far larger than localStorage can, or
 * in memory where IndexedDB is missing (tests, some private windows). The
 * methods mirror the modular SDK's `uploadBytes`, `getBlob` and `deleteObject`,
 * so ReceiptsRepo can switch without its callers changing. Nothing syncs.
 */

const DB_NAME = 'expensify.local-bucket';
const STORE = 'files';

interface StoredFile {
  blob: Blob;
  contentType: string;
}

@Injectable({ providedIn: 'root' })
export class LocalBucket {
  private readonly memory = new Map<string, StoredFile>();
  private database: Promise<IDBDatabase | null> | undefined;

  /** Like `uploadBytes(ref(storage, path), blob, { contentType })`; replaces a file at the same path. */
  async upload(path: string, blob: Blob, contentType: string): Promise<void> {
    const file: StoredFile = { blob, contentType };
    const db = await this.open();
    if (!db) {
      this.memory.set(path, file);
      return;
    }
    await request(db, 'readwrite', (store) => store.put(file, path));
  }

  /** Like `getBlob(ref(storage, path))`: rejects when there's no file there. */
  async download(path: string): Promise<Blob> {
    const db = await this.open();
    const file = db
      ? await request<StoredFile | undefined>(db, 'readonly', (store) => store.get(path))
      : this.memory.get(path);
    if (!file) throw new Error('storage/object-not-found');
    // IndexedDB may hand back a blob without its type.
    return file.blob.type === file.contentType
      ? file.blob
      : new Blob([file.blob], { type: file.contentType });
  }

  /** Like `deleteObject(ref(storage, path))`, except a missing file isn't an error. */
  async delete(path: string): Promise<void> {
    const db = await this.open();
    if (!db) {
      this.memory.delete(path);
      return;
    }
    await request(db, 'readwrite', (store) => store.delete(path));
  }

  private open(): Promise<IDBDatabase | null> {
    this.database ??= new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      try {
        const opening = indexedDB.open(DB_NAME, 1);
        opening.onupgradeneeded = () => opening.result.createObjectStore(STORE);
        opening.onsuccess = () => resolve(opening.result);
        // Blocked or refused (private mode): keep files in memory for this session.
        opening.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.database;
  }
}

function request<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
