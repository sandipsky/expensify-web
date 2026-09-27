import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';

export type MenuMode = 'left' | 'right';

/** Below this much room beneath the trigger, the panel flips above it. */
const MIN_SPACE_BELOW = 180;

/**
 * Lightweight dropdown/popover. Project the trigger via `[dropdown-display]`
 * and the panel contents via `[dropdown-item]` / `[dropdown-content]`:
 *
 * ```html
 * <l-menu mode="right">
 *   <button dropdown-display>Open</button>
 *   <div dropdown-item (click)="…">Action</div>
 * </l-menu>
 * ```
 *
 * The panel renders in a fixed layer anchored to the trigger, so it escapes any
 * `overflow` clipping on ancestors, flips above the trigger when there isn't
 * room below, and stays anchored while the page scrolls — mirroring the
 * `l-select` dropdown behavior.
 */
@Component({
  selector: 'l-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './menu.html',
  styleUrl: './menu.scss',
  host: {
    '(document:click)': '_onDocumentClick($event)',
  },
})
export class Menu {
  /** Which trigger edge the panel aligns to. */
  readonly mode = input<MenuMode>('left');
  /** Close the panel when a projected item is clicked. */
  readonly closeOnItemClick = input(true);
  /** Drop the panel's inner padding (for custom, edge-to-edge content). */
  readonly contentMode = input(false);
  /** Highlight the trigger while the panel is open. */
  readonly showActiveState = input(true);

  private readonly _open = signal(false);
  /** Whether the panel is currently open — read by consumers via a template ref. */
  readonly isOpen = this._open.asReadonly();

  protected readonly _isReady = signal(false);
  protected readonly _dropUp = signal(false);
  protected readonly _top = signal<number | null>(null);
  protected readonly _bottom = signal<number | null>(null);
  protected readonly _left = signal<number | null>(null);
  protected readonly _right = signal<number | null>(null);
  protected readonly _maxHeight = signal<number | null>(null);

  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly _onViewportChange = (): void => {
    if (this._open()) this._reposition();
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => this._unbindViewport());
  }

  /** Open when closed, close when open. */
  toggle(): void {
    this._open() ? this.close() : this._openMenu();
  }

  close(): void {
    if (!this._open()) return;
    this._open.set(false);
    this._isReady.set(false);
    this._unbindViewport();
  }

  protected _onDocumentClick(event: MouseEvent): void {
    if (this._open() && !this._host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  private _openMenu(): void {
    this._open.set(true);
    this._reposition();
    window.addEventListener('scroll', this._onViewportChange, true);
    window.addEventListener('resize', this._onViewportChange);
    // Reveal after the position is applied so it never flashes at the wrong spot.
    requestAnimationFrame(() => this._isReady.set(true));
  }

  /**
   * Anchor the fixed panel to the trigger rect: align the requested edge
   * horizontally, drop below by default, flip above when room runs out, and cap
   * the height to the space available.
   */
  private _reposition(): void {
    const rect = this._host.nativeElement.getBoundingClientRect();
    const gap = 6;
    const viewportHeight = window.innerHeight;
    // `clientWidth` excludes the vertical scrollbar; a fixed element's `right`
    // offset is measured from that same edge, so using `innerWidth` (which
    // includes the scrollbar) would shift a right-anchored panel left by the
    // scrollbar width and break the alignment.
    const viewportWidth = document.documentElement.clientWidth;
    const spaceBelow = viewportHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const dropUp = spaceBelow < MIN_SPACE_BELOW && spaceAbove > spaceBelow;

    this._dropUp.set(dropUp);
    this._maxHeight.set(Math.max(120, (dropUp ? spaceAbove : spaceBelow) - 8));

    if (this.mode() === 'right') {
      this._right.set(viewportWidth - rect.right);
      this._left.set(null);
    } else {
      this._left.set(rect.left);
      this._right.set(null);
    }

    if (dropUp) {
      this._bottom.set(viewportHeight - rect.top + gap);
      this._top.set(null);
    } else {
      this._top.set(rect.bottom + gap);
      this._bottom.set(null);
    }
  }

  private _unbindViewport(): void {
    window.removeEventListener('scroll', this._onViewportChange, true);
    window.removeEventListener('resize', this._onViewportChange);
  }
}
