import { DestroyRef, Injectable, inject } from '@angular/core';
import { receiptPath } from '../domain/attachments';
import { Attachment } from '../models/transaction';
import { LocalBucket } from './local-bucket';
import { LocalDb } from './local-db';

/**
 * How long a deleted transaction's receipts stay, so its 5-second Undo can
 * bring them back with it (TXN-07, ATT-05). A little over the toast's life.
 */
export const RECEIPT_DELETE_DELAY_MS = 8000;

/**
 * Receipt files in Cloud Storage, `users/{uid}/receipts/{transactionId}/…`
 * (§3.12, §9). The transaction's `attachments` list says which exist; this
 * stores and removes the files behind it. Deletes aren't awaited, and failures
 * are logged without paths or names (NFR-13): a leftover file is invisible to
 * the user, and the v1.1 account-deletion Function removes the whole folder.
 */
@Injectable({ providedIn: 'root' })
export class ReceiptsRepo {
  private readonly db = inject(LocalDb);
  private readonly bucket = inject(LocalBucket);
  /** Deletes waiting out an Undo, by transaction ID. */
  private readonly scheduled = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; files: readonly Attachment[] }
  >();

  constructor() {
    // Closing the tab ends any Undo, so the waiting deletes go now.
    const flush = () => this.flush();
    window.addEventListener('pagehide', flush);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('pagehide', flush);
      this.flush();
    });
  }

  /**
   * Stores a file as a receipt of the transaction and returns the entry its
   * `attachments` list takes. The transaction's ID comes first, so a new
   * entry's receipts can go up before it's saved.
   */
  async upload(transactionId: string, file: Blob, name: string): Promise<Attachment> {
    const contentType = file.type;
    const path = receiptPath(this.db.userPath, transactionId, this.db.newId(), contentType);
    await this.bucket.upload(path, file, contentType);
    return { path, name, contentType, size: file.size };
  }

  /** The file itself, for showing or saving it (ATT-04). */
  download(attachment: Pick<Attachment, 'path'>): Promise<Blob> {
    return this.bucket.download(attachment.path);
  }

  /** Deletes the files now, without waiting. */
  delete(attachments: readonly Attachment[]): void {
    for (const { path } of attachments) {
      this.bucket.delete(path).catch((error) => console.error('[receipt delete failed]', error));
    }
  }

  /** Deletes a deleted transaction's receipts once its Undo has passed (ATT-05). */
  deleteLater(transactionId: string, attachments: readonly Attachment[]): void {
    if (!attachments.length) return;
    this.keep(transactionId);
    const timer = setTimeout(() => {
      this.scheduled.delete(transactionId);
      this.delete(attachments);
    }, RECEIPT_DELETE_DELAY_MS);
    this.scheduled.set(transactionId, { timer, files: attachments });
  }

  /** Undo: the transaction is back, so its receipts stay. */
  keep(transactionId: string): void {
    const waiting = this.scheduled.get(transactionId);
    if (!waiting) return;
    clearTimeout(waiting.timer);
    this.scheduled.delete(transactionId);
  }

  private flush(): void {
    for (const [id, { timer, files }] of this.scheduled) {
      clearTimeout(timer);
      this.scheduled.delete(id);
      this.delete(files);
    }
  }
}
