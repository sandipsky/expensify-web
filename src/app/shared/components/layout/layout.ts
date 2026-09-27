import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { Header } from './header/header';
import { Sidebar } from './sidebar/sidebar';

/**
 * App shell: the sidebar runs full height on the left, the header and the scrolling
 * content sit to its right. The header's menu button collapses the sidebar to a rail
 * on desktop and slides it in as a drawer on mobile (≤768px, see sidebar.scss).
 *
 * ```html
 * <l-layout [(collapsed)]="navCollapsed">
 *   <nav layout-sidebar>…</nav>
 *   <span layout-header>Dashboard</span>
 *   <router-outlet />
 * </l-layout>
 * ```
 */
@Component({
  selector: 'l-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Header, Sidebar],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout {
  /** Desktop state: `true` shrinks the sidebar to its rail. Two-way bindable. */
  readonly collapsed = model(false);

  /** Mobile state: `true` shows the sidebar as a drawer over the content. Two-way bindable. */
  readonly mobileOpen = model(false);

  constructor() {
    // Picking a link in the mobile drawer should reveal the new page, not leave the drawer over it.
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.mobileOpen.set(false));
  }
}
