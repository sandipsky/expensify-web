import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ReceiptsRepo } from '../../../../core/data/receipts.repo';
import { Button } from '../../../../shared/components/ui/button/button';
import { Icon } from '../../../../shared/components/ui/icon/icon';
import { MODAL_DATA, ModalRef } from '../../../../shared/components/ui/modal';
import { NotificationService } from '../../../../shared/components/ui/notification';
import { Skeleton } from '../../../../shared/components/ui/skeleton';
import { objectUrl, saveFile } from '../../../../shared/files/download';
import { ReceiptItem } from '../receipt-draft';

export interface ReceiptViewerData {
  /** Stored receipts to page through. */
  items: readonly ReceiptItem[];
  /** The one to show first. */
  index: number;
  /** Offer Remove, which hands the receipt back to the opener. */
  removable: boolean;
}

/** The receipt to take off the entry, by key. */
export interface ReceiptViewerResult {
  remove: string;
}

/**
 * A receipt full screen (ATT-04): the photo or PDF, with Download and Remove,
 * and the entry's other receipts a swipe of the arrows (or ←/→) away. PDFs
 * show inline where the browser can; otherwise it offers to open them.
 */
@Component({
  selector: 'app-receipt-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Icon, Skeleton],
  templateUrl: './receipt-viewer.html',
  styleUrl: './receipt-viewer.scss',
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class ReceiptViewer {
  private readonly ref = inject<ModalRef<ReceiptViewer, ReceiptViewerResult>>(ModalRef);
  protected readonly data = inject<ReceiptViewerData>(MODAL_DATA);
  private readonly repo = inject(ReceiptsRepo);
  private readonly notify = inject(NotificationService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly index = signal(this.data.index);
  protected readonly count = this.data.items.length;
  protected readonly item = computed(() => this.data.items[this.index()]);

  /** An object URL of the file on show; null while it loads. */
  protected readonly url = signal<string | null>(null);
  protected readonly failed = signal(false);
  /** The PDF's URL for `<object>`: one this viewer made from the stored file. */
  protected readonly pdfUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.url();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  private blob: Blob | null = null;

  constructor() {
    effect(() => {
      const item = this.item();
      untracked(() => void this.load(item));
    });
    inject(DestroyRef).onDestroy(() => this.release());
    // Into the viewer, so keys and screen readers start there.
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => host.querySelector<HTMLButtonElement>('.viewer__close button')?.focus());
  }

  protected step(by: number): void {
    this.index.update((i) => (i + by + this.count) % this.count);
  }

  protected async download(): Promise<void> {
    const item = this.item();
    try {
      const blob = this.blob ?? (await this.repo.download(item.attachment!));
      saveFile(blob, item.name);
    } catch {
      this.notify.error("Couldn't download the receipt", 'Please try again.');
    }
  }

  /** Where PDFs can't show inline (most phones), the browser's own viewer opens it. */
  protected openPdf(): void {
    const url = this.url();
    if (url) window.open(url, '_blank', 'noopener');
  }

  protected remove(): void {
    this.ref.close({ remove: this.item().key });
  }

  protected close(): void {
    this.ref.close();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.count < 2) return;
    if (event.key === 'ArrowLeft') this.step(-1);
    else if (event.key === 'ArrowRight') this.step(1);
    else return;
    event.preventDefault();
  }

  private async load(item: ReceiptItem): Promise<void> {
    this.release();
    this.failed.set(false);
    if (!item.attachment) {
      this.failed.set(true);
      return;
    }
    try {
      const blob = await this.repo.download(item.attachment);
      if (this.item() !== item) return;
      const url = objectUrl(blob);
      if (!url) throw new Error('No object URL');
      this.blob = blob;
      this.url.set(url);
    } catch {
      if (this.item() === item) this.failed.set(true);
    }
  }

  private release(): void {
    const url = this.url();
    if (url) URL.revokeObjectURL(url);
    this.url.set(null);
    this.blob = null;
  }
}
