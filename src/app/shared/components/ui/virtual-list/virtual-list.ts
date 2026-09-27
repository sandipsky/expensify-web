import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  TemplateRef,
  computed,
  contentChild,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { injectVirtualWindow } from './virtual-window';

/** Template context for one item: the item as `$implicit` and its position in `items`. */
export interface VirtualItemContext<T> {
  $implicit: T;
  index: number;
}

/**
 * Marks the `<ng-template>` that renders each item of an `l-virtual-list`.
 *
 * ```html
 * <ng-template lVirtualItem let-row let-i="index">…</ng-template>
 * ```
 */
@Directive({ selector: 'ng-template[lVirtualItem]' })
export class VirtualItem {
  readonly template = inject<TemplateRef<VirtualItemContext<unknown>>>(TemplateRef);
}

/**
 * A long list that renders only the items in and near view, padding the rest
 * with spacers, so thousands of rows scroll smoothly. It scrolls with the page
 * (the nearest scrolling ancestor), not in a box of its own. Every item has a
 * fixed height from `itemSize`, a number or a function per item, and is laid
 * out in a box of exactly that height.
 *
 * ```html
 * <l-virtual-list [items]="rows()" [itemSize]="sizeOf" [trackBy]="idOf" (endReached)="more()">
 *   <ng-template lVirtualItem let-row>…</ng-template>
 * </l-virtual-list>
 * ```
 *
 * Only rendered items are in the DOM, so offer another way to reach the rest,
 * such as search or filters, and keep in-page find in mind.
 */
@Component({
  selector: 'l-virtual-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  template: `
    <div class="l-virtual-list__spacer" [style.height.px]="_range().before"></div>
    @for (item of _slice(); track _track(item, _range().start + $index)) {
      <div class="l-virtual-list__item" [style.height.px]="_sizes()[_range().start + $index]">
        <ng-container
          [ngTemplateOutlet]="_item()?.template ?? null"
          [ngTemplateOutletContext]="{ $implicit: item, index: _range().start + $index }"
        />
      </div>
    }
    <div class="l-virtual-list__spacer" [style.height.px]="_range().after"></div>
  `,
  styles: `
    :host {
      display: block;
    }
    /* The spacers change height while scrolling; anchoring to them would make the page jump. */
    :host > * {
      overflow-anchor: none;
    }
  `,
  host: { class: 'l-virtual-list' },
})
export class VirtualList<T = unknown> {
  readonly items = input<readonly T[]>([]);
  /** Each item's height in px: one number for all, or a function of the item. */
  readonly itemSize = input<number | ((item: T, index: number) => number)>(48);
  /** Item identity for rendering; defaults to the item itself. */
  readonly trackBy = input<(item: T, index: number) => unknown>((item) => item);
  /** Extra px rendered above and below the visible area. */
  readonly overscan = input(600);

  /** Emits once the last item renders, for loading the next page. Again after `items` grows. */
  readonly endReached = output<void>();

  protected readonly _item = contentChild(VirtualItem);
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly _sizes = computed(() => {
    const size = this.itemSize();
    const items = this.items();
    return typeof size === 'number' ? items.map(() => size) : items.map(size);
  });

  protected readonly _range = injectVirtualWindow({
    anchor: () => this._host.nativeElement,
    sizes: this._sizes,
    overscan: this.overscan,
  });

  protected readonly _slice = computed(() =>
    this.items().slice(this._range().start, this._range().end),
  );

  protected _track(item: T, index: number): unknown {
    return this.trackBy()(item, index);
  }

  constructor() {
    let reportedAt = -1;
    effect(() => {
      const count = this.items().length;
      if (count && this._range().end === count && reportedAt !== count) {
        reportedAt = count;
        this.endReached.emit();
      }
    });
  }
}
