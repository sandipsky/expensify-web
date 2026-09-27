import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChildren,
} from '@angular/core';
import type { Tab } from './tab';

export type TabsOrientation = 'horizontal' | 'vertical';
export type TabsVariant = 'line' | 'pills';
export type TabsSize = 'sm' | 'md' | 'lg';

/**
 * Tab set with a sliding active indicator, laid out `horizontal` (default) or
 * `vertical`. Project {@link Tab} children — the container renders the tab strip
 * from their `label`/`icon` and shows the active tab's projected panel:
 *
 * ```html
 * <l-tabs [(value)]="tab" orientation="vertical">
 *   <l-tab label="Profile" icon="👤">…</l-tab>
 *   <l-tab label="Settings" icon="⚙️">…</l-tab>
 *   <l-tab label="Archived" [disabled]="true">…</l-tab>
 * </l-tabs>
 * ```
 *
 * Active state is a two-way `value` model (a tab's `value`, falling back to its
 * index). Follows the WAI-ARIA tabs pattern with roving arrow-key navigation.
 */
@Component({
  selector: 'l-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tabs.html',
  styleUrl: './tabs.scss',
  host: {
    '[class]': '_hostClasses()',
  },
})
export class Tabs {
  readonly orientation = input<TabsOrientation>('horizontal');
  readonly variant = input<TabsVariant>('line');
  readonly size = input<TabsSize>('md');
  /** Stretch horizontal tabs to fill the width in equal parts. */
  readonly grow = input(false);
  /** The active tab's `value` (or its index when no `value` was given). */
  readonly value = model<unknown>(null);

  readonly activeChange = output<unknown>();

  private readonly _tabs = signal<Tab[]>([]);
  readonly tabs = this._tabs.asReadonly();

  private readonly _buttons = viewChildren<ElementRef<HTMLButtonElement>>('tabBtn');
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Geometry of the sliding indicator behind/under the active tab. */
  protected readonly _indicator = signal({ x: 0, y: 0, width: 0, height: 0, visible: false });
  /** Gate the slide transition until after first paint so it never flashes from 0,0. */
  protected readonly _ready = signal(false);

  protected readonly _hostClasses = computed(() => {
    const classes = [
      'l-tabs',
      `l-tabs--${this.orientation()}`,
      `l-tabs--${this.variant()}`,
      `l-tabs--${this.size()}`,
    ];
    if (this.grow()) classes.push('l-tabs--grow');
    return classes.join(' ');
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    effect(() => {
      // Track everything that can move the active tab or resize the strip.
      this.value();
      this._tabs();
      this.orientation();
      this.variant();
      this.size();
      this.grow();
      queueMicrotask(() => this._positionIndicator());
    });

    afterNextRender(() => {
      this._positionIndicator();
      requestAnimationFrame(() => this._ready.set(true));

      const observer = new ResizeObserver(() => this._positionIndicator());
      observer.observe(this._host.nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  /** @internal Called by a tab on init (in DOM order). */
  _register(tab: Tab): void {
    this._tabs.update((tabs) => [...tabs, tab]);
    // Default the selection to the first enabled tab.
    if (this.value() == null && !tab.disabled()) {
      this.value.set(this._valueOf(tab));
    }
  }

  /** @internal Called by a tab on destroy. */
  _unregister(tab: Tab): void {
    this._tabs.update((tabs) => tabs.filter((t) => t !== tab));
  }

  /** @internal A tab's value, falling back to its index when none was given. */
  _valueOf(tab: Tab): unknown {
    const value = tab.value();
    return value === undefined || value === null ? this._tabs().indexOf(tab) : value;
  }

  isActive(tab: Tab): boolean {
    return this.value() === this._valueOf(tab);
  }

  protected _select(tab: Tab): void {
    if (tab.disabled()) return;
    const value = this._valueOf(tab);
    if (value === this.value()) return;
    this.value.set(value);
    this.activeChange.emit(value);
  }

  protected _onKeydown(event: KeyboardEvent, index: number): void {
    const vertical = this.orientation() === 'vertical';
    let target = -1;
    switch (event.key) {
      case vertical ? 'ArrowDown' : 'ArrowRight':
        target = this._nextEnabled(index, 1);
        break;
      case vertical ? 'ArrowUp' : 'ArrowLeft':
        target = this._nextEnabled(index, -1);
        break;
      case 'Home':
        target = this._nextEnabled(-1, 1);
        break;
      case 'End':
        target = this._nextEnabled(this._tabs().length, -1);
        break;
      default:
        return;
    }
    if (target < 0) return;
    event.preventDefault();
    this._select(this._tabs()[target]);
    this._buttons()[target]?.nativeElement.focus();
  }

  private _nextEnabled(from: number, direction: number): number {
    const tabs = this._tabs();
    const count = tabs.length;
    for (let step = 1; step <= count; step++) {
      const index = (from + direction * step + count * 2) % count;
      if (!tabs[index].disabled()) return index;
    }
    return -1;
  }

  private _positionIndicator(): void {
    const tabs = this._tabs();
    const index = tabs.findIndex((t) => this.isActive(t));
    const button = this._buttons()[index]?.nativeElement;
    if (index < 0 || !button) {
      this._indicator.update((i) => ({ ...i, visible: false }));
      return;
    }

    const line = this.variant() === 'line';
    const thickness = 2;
    let geometry: { x: number; y: number; width: number; height: number };

    if (line && this.orientation() === 'horizontal') {
      geometry = {
        x: button.offsetLeft,
        y: button.offsetTop + button.offsetHeight - thickness,
        width: button.offsetWidth,
        height: thickness,
      };
    } else if (line) {
      geometry = {
        x: button.offsetLeft + button.offsetWidth - thickness,
        y: button.offsetTop,
        width: thickness,
        height: button.offsetHeight,
      };
    } else {
      // pills — full button rect
      geometry = {
        x: button.offsetLeft,
        y: button.offsetTop,
        width: button.offsetWidth,
        height: button.offsetHeight,
      };
    }

    this._indicator.set({ ...geometry, visible: true });
  }
}
