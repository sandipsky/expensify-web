import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { Menu } from '../menu/menu';

/** Payload emitted whenever the page index or page size changes. */
export interface PageEvent {
  pageIndex: number;
  pageSize: number;
  length: number;
}

/**
 * Page navigation with first/prev/next/last controls, a windowed page-number
 * strip, and a page-size dropdown (built on {@link Menu}).
 *
 * ```html
 * <l-pagination [length]="totalRows" [(pageIndex)]="page" (pageChange)="load($event)" />
 * ```
 */
@Component({
  selector: 'l-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Menu],
  templateUrl: './pagination.html',
  styleUrl: './pagination.scss',
})
export class Pagination {
  readonly pageSizeOptions = input<number[]>([10, 25, 50, 100]);
  readonly length = input<number>(0);

  readonly pageSize = model<number>(10);
  readonly pageIndex = model<number>(0);

  readonly pageChange = output<PageEvent>();

  protected readonly _totalPages = computed(() => {
    const len = this.length();
    return len > 0 ? Math.ceil(len / this.pageSize()) : 1;
  });

  /** Digit count of the largest page number — sizes every page button to the widest one. */
  protected readonly _pageNumChars = computed(() => String(this._totalPages()).length);

  /** A sliding window of up to five page numbers centered on the current page. */
  protected readonly _visiblePages = computed(() => {
    const total = this._totalPages();
    const current = this.pageIndex() + 1;

    let start = Math.max(current - 2, 1);
    let end = start + 4;
    if (end > total) {
      end = total;
      start = Math.max(end - 4, 1);
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  });

  protected readonly _itemsInView = computed(() => {
    if (this.length() === 0) return 0;
    const remaining = this.length() - this.pageIndex() * this.pageSize();
    return Math.min(this.pageSize(), remaining);
  });

  protected _onChangePageOption(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(0);
    this._emitChange();
  }

  protected _onPrevAndNext(direction: 'prev' | 'next'): void {
    this.pageIndex.update((idx) => (direction === 'prev' ? idx - 1 : idx + 1));
    this._emitChange();
  }

  protected _goFirstPage(): void {
    this.pageIndex.set(0);
    this._emitChange();
  }

  protected _goLastPage(): void {
    this.pageIndex.set(this._totalPages() - 1);
    this._emitChange();
  }

  protected _goToPage(index: number): void {
    this.pageIndex.set(index);
    this._emitChange();
  }

  private _emitChange(): void {
    this.pageChange.emit({
      pageIndex: this.pageIndex(),
      pageSize: this.pageSize(),
      length: this.length(),
    });
  }
}
