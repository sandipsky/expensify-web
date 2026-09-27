import {
  DestroyRef,
  Signal,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

/** Which items of a long list to render, and the space the rest take up. */
export interface VirtualRange {
  /** First rendered index. */
  start: number;
  /** One past the last rendered index. */
  end: number;
  /** Height of the items above the rendered ones, px. */
  before: number;
  /** Height of the items below the rendered ones, px. */
  after: number;
}

export interface VirtualWindowOptions {
  /** The element the first item's top edge sits at. Read after render. */
  anchor: () => HTMLElement | undefined;
  /** Every item's height in px, in order. Items must render exactly this tall. */
  sizes: Signal<readonly number[]>;
  /** Extra px rendered above and below the visible area, so fast scrolls stay filled. */
  overscan?: Signal<number> | number;
}

/** Used until the viewport can be measured (jsdom, hidden containers). */
const FALLBACK_VIEWPORT = 800;

/**
 * Tracks which items of a long list are in or near view, so a component can
 * render only those and pad the rest with spacers. It follows the nearest
 * ancestor that scrolls vertically (in the app, the shell's `<main>`), or the
 * window, and re-measures on any scroll, on resize and when `sizes` changes.
 * Heights are fixed per item and known up front, which keeps it cheap: no
 * measuring of rendered rows. Call it in an injection context.
 */
export function injectVirtualWindow(options: VirtualWindowOptions): Signal<VirtualRange> {
  const overscan =
    typeof options.overscan === 'number' || options.overscan === undefined
      ? signal(options.overscan ?? 600)
      : options.overscan;

  /** The visible area, in px from the anchor's top edge. */
  const view = signal({ top: 0, height: 0 });

  const offsets = computed(() => {
    const sizes = options.sizes();
    const result = new Array<number>(sizes.length + 1);
    result[0] = 0;
    for (let i = 0; i < sizes.length; i++) result[i + 1] = result[i] + sizes[i];
    return result;
  });

  const range = computed<VirtualRange>(
    () => {
      const tops = offsets();
      const count = tops.length - 1;
      const total = tops[count];
      const { top, height } = view();
      const from = Math.max(0, top - overscan());
      const to = top + (height > 0 ? height : FALLBACK_VIEWPORT) + overscan();
      // The item that `from` falls in, then the first item starting at or after `to`.
      const start = Math.min(count, Math.max(0, search(tops, from, count, true) - 1));
      const end = Math.max(start, search(tops, to, count, false));
      return { start, end, before: tops[start], after: total - tops[end] };
    },
    {
      equal: (a, b) =>
        a.start === b.start && a.end === b.end && a.before === b.before && a.after === b.after,
    },
  );

  let frame = 0;
  const measure = () => {
    frame = 0;
    const anchor = options.anchor();
    if (!anchor) return;
    const scroller = scrollParent(anchor);
    const bounds = scroller ? scroller.getBoundingClientRect() : null;
    const viewTop = Math.max(0, bounds?.top ?? 0);
    const viewBottom = Math.min(window.innerHeight, bounds?.bottom ?? window.innerHeight);
    const top = viewTop - anchor.getBoundingClientRect().top;
    const height = Math.max(0, viewBottom - viewTop);
    const current = view();
    if (current.top !== top || current.height !== height) view.set({ top, height });
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };

  // An item list of a new length may have moved the anchor or made an ancestor scroll.
  effect(() => {
    options.sizes();
    schedule();
  });

  afterNextRender(() => {
    measure();
    // Scroll events don't bubble, but capturing at the window sees every scroller's.
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
  });

  inject(DestroyRef).onDestroy(() => {
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener('scroll', schedule, { capture: true });
    window.removeEventListener('resize', schedule);
  });

  return range;
}

/** Index of the first offset after `y` (or at it, unless `strict`), among offsets 0…count. */
function search(offsets: readonly number[], y: number, count: number, strict: boolean): number {
  let low = 0;
  let high = count;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (strict ? offsets[mid] <= y : offsets[mid] < y) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * The nearest ancestor that scrolls vertically, or null for the window. An
 * `overflow: auto` box that grows with its content (like a table's horizontal
 * scroller) doesn't count.
 */
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (/auto|scroll|overlay/.test(overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return null;
}
