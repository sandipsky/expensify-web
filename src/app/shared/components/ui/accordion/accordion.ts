import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { AccordionItem } from './accordion-item';

export type AccordionVariant = 'contained' | 'separated';

/**
 * Container for a stack of collapsible {@link AccordionItem}s. Owns the open
 * state — `multiple` decides whether several panels can stay open at once or
 * opening one collapses the rest — and the roving-focus keyboard navigation
 * across the item headers.
 *
 * ```html
 * <l-accordion [multiple]="true">
 *   <l-accordion-item title="Section one">…</l-accordion-item>
 *   <l-accordion-item title="Section two">…</l-accordion-item>
 * </l-accordion>
 * ```
 */
@Component({
  selector: 'l-accordion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  styleUrl: './accordion.scss',
  host: {
    '[class]': '_hostClasses()',
  },
})
export class Accordion {
  /** Allow more than one panel to be open simultaneously. Default: single-open. */
  readonly multiple = input(false);
  /** `contained` (one bordered list with dividers) or `separated` (spaced cards). */
  readonly variant = input<AccordionVariant>('contained');
  /** Which side the chevron sits on. Default: 'right'. */
  readonly iconPosition = input<'left' | 'right'>('right');

  private readonly _items = signal<AccordionItem[]>([]);
  private readonly _open = signal<ReadonlySet<AccordionItem>>(new Set());

  protected readonly _hostClasses = computed(() => `l-accordion l-accordion--${this.variant()}`);

  /** @internal Called by an item on init (in DOM order). */
  _register(item: AccordionItem): void {
    this._items.update((items) => [...items, item]);
    if (item.expanded()) {
      this._open.update((prev) => {
        const next = new Set(this.multiple() ? prev : []);
        next.add(item);
        return next;
      });
    }
  }

  /** @internal Called by an item on destroy. */
  _unregister(item: AccordionItem): void {
    this._items.update((items) => items.filter((i) => i !== item));
    this._open.update((prev) => {
      if (!prev.has(item)) return prev;
      const next = new Set(prev);
      next.delete(item);
      return next;
    });
  }

  /** @internal Reactive read used by an item to know whether it is open. */
  _isOpen(item: AccordionItem): boolean {
    return this._open().has(item);
  }

  /** @internal Toggle an item, honoring single/multiple mode. */
  _toggle(item: AccordionItem): void {
    if (item.disabled()) return;
    const isOpen = this._open().has(item);
    this._open.update((prev) => {
      const next = new Set(this.multiple() ? prev : []);
      if (this.multiple() && isOpen) {
        next.delete(item);
      } else if (!isOpen) {
        next.add(item);
      }
      return next;
    });
  }

  /** @internal Roving focus across enabled headers (Arrow/Home/End). */
  _moveFocus(from: AccordionItem, key: string): void {
    const items = this._items().filter((i) => !i.disabled());
    if (!items.length) return;
    const index = items.indexOf(from);
    let target: AccordionItem | undefined;
    switch (key) {
      case 'ArrowDown':
        target = items[(index + 1) % items.length];
        break;
      case 'ArrowUp':
        target = items[(index - 1 + items.length) % items.length];
        break;
      case 'Home':
        target = items[0];
        break;
      case 'End':
        target = items[items.length - 1];
        break;
    }
    target?._focusHeader();
  }
}
