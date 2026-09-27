import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';

export type UploadStatus = 'pending' | 'uploading' | 'success' | 'error';
export type UploadVariant = 'dropzone' | 'button';
export type UploadListType = 'list' | 'grid';
export type RejectReason = 'type' | 'size' | 'count';

/** A tracked file in the uploader's list. */
export interface UploadFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  status: UploadStatus;
  /** 0–100. Drive this from your real upload via {@link FileUpload.patchFile}. */
  progress: number;
  /** Object URL (images) or a remote URL for the thumbnail. */
  url?: string;
  error?: string;
}

let _uid = 0;

/**
 * Image / file upload with a drag-and-drop dropzone (or a compact button
 * trigger), inspired by Ant Design's `Upload`. Validates by `accept`, size and
 * count, shows image thumbnails, and renders a list (rows) or grid (cards) with
 * per-file progress and a remove control.
 *
 * The component is presentational: it manages selection, validation, previews
 * and the list. Wire your real upload by handling `(added)` and reporting
 * progress/outcome back through {@link patchFile}. Selected files are exposed as
 * a two-way `files` model.
 *
 * ```html
 * <l-file-upload accept="image/*" [multiple]="true" [maxSizeMb]="5"
 *                listType="grid" (added)="upload($event)" [(files)]="files" />
 * ```
 */
@Component({
  selector: 'l-file-upload',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './file-upload.html',
  styleUrl: './file-upload.scss',
  host: {
    '[class]': '_hostClasses()',
  },
})
export class FileUpload {
  /** Native `accept` filter, e.g. `image/*` or `.pdf,.docx`. */
  readonly accept = input<string>('');
  readonly multiple = input(true);
  /** Reject files larger than this many megabytes (0 = no limit). */
  readonly maxSizeMb = input(0);
  /** Cap the number of files kept (0 = no limit). */
  readonly maxCount = input(0);
  readonly disabled = input(false);
  readonly variant = input<UploadVariant>('dropzone');
  readonly listType = input<UploadListType>('list');
  /** Primary line inside the dropzone. */
  readonly label = input<string>('Click or drag files here to upload');
  /** Secondary hint (defaults to a summary of the accept/size limits). */
  readonly hint = input<string>('');

  readonly files = model<UploadFile[]>([]);

  /** Accepted files, as they are added. Kick off your upload here. */
  readonly added = output<UploadFile[]>();
  readonly removed = output<UploadFile>();
  readonly rejected = output<{ file: File; reason: RejectReason }>();

  private readonly _input = viewChild.required<ElementRef<HTMLInputElement>>('input');
  private readonly _objectUrls = new Set<string>();

  protected readonly _dragging = signal(false);

  protected readonly _hostClasses = computed(() => {
    const classes = ['l-upload', `l-upload--${this.variant()}`, `l-upload--${this.listType()}`];
    if (this.disabled()) classes.push('is-disabled');
    if (this._dragging()) classes.push('is-dragging');
    return classes.join(' ');
  });

  /** In single-file mode, hide the trigger once a file is chosen (shown again on remove). */
  protected readonly _showTrigger = computed(() => this.multiple() || this.files().length === 0);

  protected readonly _resolvedHint = computed(() => {
    if (this.hint()) return this.hint();
    const parts: string[] = [];
    if (this.accept()) parts.push(this.accept());
    if (this.maxSizeMb()) parts.push(`up to ${this.maxSizeMb()} MB`);
    return parts.join(' · ');
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this._objectUrls.forEach((url) => URL.revokeObjectURL(url));
      this._objectUrls.clear();
    });
  }

  protected _browse(): void {
    if (this.disabled()) return;
    this._input().nativeElement.click();
  }

  protected _onInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) this._ingest(input.files);
    // Reset so selecting the same file again still fires `change`.
    input.value = '';
  }

  protected _onDragOver(event: DragEvent): void {
    if (this.disabled()) return;
    event.preventDefault();
    this._dragging.set(true);
  }

  protected _onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this._dragging.set(false);
  }

  protected _onDrop(event: DragEvent): void {
    if (this.disabled()) return;
    event.preventDefault();
    this._dragging.set(false);
    if (event.dataTransfer?.files.length) this._ingest(event.dataTransfer.files);
  }

  protected _remove(item: UploadFile, event: Event): void {
    event.stopPropagation();
    if (item.url && this._objectUrls.has(item.url)) {
      URL.revokeObjectURL(item.url);
      this._objectUrls.delete(item.url);
    }
    this.files.update((list) => list.filter((f) => f.id !== item.id));
    this.removed.emit(item);
  }

  protected _isImage(item: UploadFile): boolean {
    return item.type.startsWith('image/');
  }

  protected _formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  }

  /**
   * Patch a tracked file — call this as your real upload progresses, e.g.
   * `patchFile(id, { status: 'uploading', progress: 40 })`.
   */
  patchFile(id: string, patch: Partial<Omit<UploadFile, 'id' | 'file'>>): void {
    this.files.update((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  /** Remove every file. */
  clear(): void {
    this._objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this._objectUrls.clear();
    this.files.set([]);
  }

  private _ingest(fileList: FileList): void {
    const incoming = Array.from(fileList);
    const accepted: UploadFile[] = [];

    for (const file of incoming) {
      if (!this._matchesAccept(file)) {
        this.rejected.emit({ file, reason: 'type' });
        continue;
      }
      if (this.maxSizeMb() && file.size > this.maxSizeMb() * 1024 * 1024) {
        this.rejected.emit({ file, reason: 'size' });
        continue;
      }
      accepted.push(this._toUploadFile(file));
    }

    if (!accepted.length) return;

    if (!this.multiple()) {
      // Single-file mode: the newest selection replaces the list.
      this._revokeAll(this.files());
      this.files.set([accepted[accepted.length - 1]]);
      this.added.emit([accepted[accepted.length - 1]]);
      return;
    }

    let next = [...this.files(), ...accepted];
    let kept = accepted;
    const cap = this.maxCount();
    if (cap && next.length > cap) {
      const overflow = next.slice(cap);
      overflow.forEach((f) => {
        this._revoke(f);
        this.rejected.emit({ file: f.file, reason: 'count' });
      });
      next = next.slice(0, cap);
      kept = accepted.filter((f) => next.includes(f));
    }

    this.files.set(next);
    if (kept.length) this.added.emit(kept);
  }

  private _toUploadFile(file: File): UploadFile {
    let url: string | undefined;
    if (file.type.startsWith('image/')) {
      url = URL.createObjectURL(file);
      this._objectUrls.add(url);
    }
    return {
      id: `l-upload-${_uid++}`,
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'pending',
      progress: 0,
      url,
    };
  }

  private _matchesAccept(file: File): boolean {
    const accept = this.accept().trim();
    if (!accept) return true;
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    return accept.split(',').some((raw) => {
      const token = raw.trim().toLowerCase();
      if (!token) return false;
      if (token.startsWith('.')) return name.endsWith(token);
      if (token.endsWith('/*')) return type.startsWith(token.slice(0, -1));
      return type === token;
    });
  }

  private _revoke(item: UploadFile): void {
    if (item.url && this._objectUrls.has(item.url)) {
      URL.revokeObjectURL(item.url);
      this._objectUrls.delete(item.url);
    }
  }

  private _revokeAll(items: UploadFile[]): void {
    items.forEach((item) => this._revoke(item));
  }
}
