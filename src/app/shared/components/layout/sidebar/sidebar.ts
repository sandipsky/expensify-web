import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  model,
  signal,
} from '@angular/core';

/** Keep in sync with the media query in sidebar.scss. */
const MOBILE_BREAKPOINT = '(max-width: 768px)';

@Component({
  selector: 'l-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  host: {
    '[class]': '_hostClasses()',
    '(document:keydown.escape)': '_onEscape()',
  },
})
export class Sidebar {
  /** Desktop state: `true` shrinks the rail from 200px to 70px. Two-way bindable. */
  readonly collapsed = model(false);

  /** Mobile state: `true` slides the drawer in over the content. Two-way bindable. */
  readonly mobileOpen = model(false);

  private readonly _mediaQuery = window.matchMedia(MOBILE_BREAKPOINT);
  protected readonly _isMobile = signal(this._mediaQuery.matches);

  protected readonly _hostClasses = computed(() =>
    [
      'l-sidebar',
      this.collapsed() ? 'l-sidebar--collapsed' : '',
      this.mobileOpen() ? 'l-sidebar--open' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );

  constructor() {
    const onChange = (event: MediaQueryListEvent) => {
      this._isMobile.set(event.matches);
      // Leaving mobile view: never keep a stale open drawer behind the static rail.
      if (!event.matches) this.mobileOpen.set(false);
    };
    this._mediaQuery.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => this._mediaQuery.removeEventListener('change', onChange));
  }

  /** Collapses/expands on desktop, opens/closes the drawer on mobile. */
  toggle(): void {
    if (this._isMobile()) {
      this.mobileOpen.update((open) => !open);
    } else {
      this.collapsed.update((collapsed) => !collapsed);
    }
  }

  protected _onEscape(): void {
    if (this._isMobile() && this.mobileOpen()) this.mobileOpen.set(false);
  }
}
