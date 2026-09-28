import { DocData, LocalBatch, LocalDb } from './local-db';

/** Firestore caps a batch at 500 writes; bulk writes stay well under it. */
export const MAX_BATCH_WRITES = 450;

/** Collects plain writes and commits them in batches under Firestore's cap. */
export class ChunkedWriter {
  private batch: LocalBatch;
  private count = 0;

  constructor(
    private readonly db: LocalDb,
    private readonly commit: (batch: LocalBatch) => void,
  ) {
    this.batch = db.batch();
  }

  set(path: string, data: DocData): void {
    this.add((b) => b.set(path, data));
  }

  add(write: (batch: LocalBatch) => void): void {
    if (this.count >= MAX_BATCH_WRITES) this.flush();
    write(this.batch);
    this.count++;
  }

  flush(): void {
    if (!this.count) return;
    this.commit(this.batch);
    this.batch = this.db.batch();
    this.count = 0;
  }
}
