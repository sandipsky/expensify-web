import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { ReceiptsRepo } from '../../../core/data/receipts.repo';
import {
  AttachmentKind,
  MAX_ATTACHMENTS,
  attachmentKind,
  attachmentName,
  fitsSizeLimit,
  removedAttachments,
} from '../../../core/domain/attachments';
import { Attachment } from '../../../core/models/transaction';
import { compressImage } from '../../../shared/files/compress-image';
import { objectUrl } from '../../../shared/files/download';

/** Why a picked file isn't a receipt: wrong type, too big, one too many, or storing it failed. */
export type ReceiptProblem = 'type' | 'size' | 'count' | 'failed';

/** One receipt as the form shows it. */
export interface ReceiptItem {
  key: string;
  name: string;
  kind: AttachmentKind;
  size: number;
  status: 'uploading' | 'ready' | 'error';
  /** Set once the file is stored. */
  attachment?: Attachment;
  /** An object URL for a photo's thumbnail. */
  previewUrl?: string;
  problem?: ReceiptProblem;
}

/**
 * The receipts of the entry a transaction form is editing (§3.12). Picked
 * files are compressed (ATT-02) and stored under the entry's ID at once, so
 * Save writes the entry with its full `attachments` list in one batch. Until
 * then nothing is final: closing the form without saving deletes the files it
 * stored, and receipts removed from a saved entry are deleted only once the
 * edit has been written. Provided by the form.
 */
@Injectable()
export class ReceiptDraft {
  private readonly repo = inject(ReceiptsRepo);

  private readonly items = signal<ReceiptItem[]>([]);
  readonly list = this.items.asReadonly();

  /** A file is still being compressed or stored; saving waits for it. */
  readonly uploading = computed(() => this.items().some((i) => i.status === 'uploading'));
  /** What the entry is saved with, in the order shown. */
  readonly attachments = computed(() =>
    this.items().flatMap((i) => (i.status === 'ready' && i.attachment ? [i.attachment] : [])),
  );
  /** Receipts kept or on their way; failed ones don't count toward the three (ATT-01). */
  readonly count = computed(() => this.items().filter((i) => i.status !== 'error').length);
  readonly remaining = computed(() => Math.max(0, MAX_ATTACHMENTS - this.count()));

  private transactionId = '';
  /** What the saved entry lists, to tell what an edit removed. */
  private stored: Attachment[] = [];
  /** Receipts stored for this draft and not yet saved with the entry. */
  private readonly fresh = new Set<string>();
  /** Bumped by `start()` and on destroy, so a slow upload for an old draft is thrown away. */
  private generation = 0;
  private seq = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.discard();
      this.generation++;
      for (const item of this.items()) this.revoke(item);
    });
  }

  /** Begins a draft for an entry: its ID (new entries get one before saving) and what it has. */
  start(transactionId: string, attachments: readonly Attachment[]): void {
    this.generation++;
    for (const item of this.items()) this.revoke(item);
    this.transactionId = transactionId;
    this.stored = [...attachments];
    this.fresh.clear();
    this.items.set(attachments.map((a) => this.storedItem(a)));
    for (const item of this.items()) void this.loadPreview(item);
  }

  /** Compresses and stores picked files, up to the three an entry holds (ATT-01, ATT-02). */
  async add(files: readonly File[]): Promise<ReceiptProblem[]> {
    const problems: ReceiptProblem[] = [];
    const room = this.remaining();
    if (files.length > room) problems.push('count');
    await Promise.all(
      files.slice(0, room).map(async (file) => {
        const problem = await this.upload(file);
        if (problem) problems.push(problem);
      }),
    );
    return problems;
  }

  /**
   * Takes a receipt off the entry. A file stored for this draft is deleted now;
   * one the saved entry lists goes once the edit is saved.
   */
  remove(key: string): void {
    const item = this.items().find((i) => i.key === key);
    if (!item) return;
    this.items.update((list) => list.filter((i) => i.key !== key));
    this.revoke(item);
    if (item.attachment && this.fresh.delete(item.attachment.path)) {
      this.repo.delete([item.attachment]);
    }
  }

  /**
   * The entry was written with `attachments()`. Once `written` confirms it,
   * the files the entry no longer lists are deleted.
   */
  saved(written: Promise<boolean>): void {
    const removed = removedAttachments(this.stored, this.attachments());
    this.stored = this.attachments();
    this.fresh.clear();
    if (removed.length) {
      void written.then((ok) => {
        if (ok) this.repo.delete(removed);
      });
    }
  }

  /** The form closed without saving: files stored for it go. */
  discard(): void {
    const unsaved = this.attachments().filter((a) => this.fresh.has(a.path));
    this.fresh.clear();
    this.repo.delete(unsaved);
  }

  private async upload(file: File): Promise<ReceiptProblem | null> {
    const generation = this.generation;
    const kind = attachmentKind(file.type, file.name);
    const key = `new-${++this.seq}`;
    if (!kind) return 'type';
    this.items.update((list) => [
      ...list,
      { key, name: file.name, kind, size: file.size, status: 'uploading' },
    ]);

    let attachment: Attachment | undefined;
    let problem: ReceiptProblem | null = null;
    let blob: Blob = file;
    try {
      if (kind === 'image') blob = (await compressImage(file)) ?? file;
      else if (!file.type) blob = new Blob([file], { type: 'application/pdf' });
      if (!fitsSizeLimit(blob.size)) problem = 'size';
      else
        attachment = await this.repo.upload(
          this.transactionId,
          blob,
          attachmentName(file.name, blob.type),
        );
    } catch (error) {
      console.error('[receipt upload failed]', error);
      problem = 'failed';
    }

    // The form moved on, or the user removed it while it went up.
    const current = this.items().some((i) => i.key === key);
    if (generation !== this.generation || !current) {
      if (attachment) this.repo.delete([attachment]);
      return null;
    }
    if (attachment) this.fresh.add(attachment.path);
    const previewUrl = attachment && kind === 'image' ? objectUrl(blob) : undefined;
    this.items.update((list) =>
      list.map((i) =>
        i.key !== key
          ? i
          : attachment
            ? {
                ...i,
                name: attachment.name,
                size: attachment.size,
                status: 'ready',
                attachment,
                previewUrl,
              }
            : { ...i, status: 'error', problem: problem ?? 'failed', size: blob.size },
      ),
    );
    return problem;
  }

  private storedItem(attachment: Attachment): ReceiptItem {
    return {
      key: attachment.path,
      name: attachment.name,
      kind: attachmentKind(attachment.contentType, attachment.name) ?? 'image',
      size: attachment.size,
      status: 'ready',
      attachment,
    };
  }

  /** Fetches a saved photo for its thumbnail. */
  private async loadPreview(item: ReceiptItem): Promise<void> {
    if (item.kind !== 'image' || !item.attachment) return;
    const generation = this.generation;
    try {
      const blob = await this.repo.download(item.attachment);
      if (generation !== this.generation || !this.items().some((i) => i.key === item.key)) return;
      const previewUrl = objectUrl(blob);
      if (!previewUrl) return;
      this.items.update((list) => list.map((i) => (i.key === item.key ? { ...i, previewUrl } : i)));
    } catch {
      // No thumbnail: the tile shows the photo icon, and the viewer says it can't open it.
    }
  }

  private revoke(item: ReceiptItem): void {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  }
}
