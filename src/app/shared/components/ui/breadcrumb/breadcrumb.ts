import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface BreadcrumbItem {
  /** Visible crumb text. */
  label: string;
  /** Optional router link; omit for the current (last) page. */
  link?: string | unknown[];
}

/**
 * Presentational breadcrumb trail. Pass the crumbs as `items` — the last one is
 * rendered as the current page; earlier ones link via `routerLink` when they
 * carry a `link`.
 *
 * ```html
 * <l-breadcrumb
 *   title="Order #1024"
 *   [items]="[
 *     { label: 'Home', link: '/' },
 *     { label: 'Orders', link: '/orders' },
 *     { label: 'Order #1024' },
 *   ]"
 * />
 * ```
 */
@Component({
  selector: 'l-breadcrumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './breadcrumb.html',
  styleUrl: './breadcrumb.scss',
})
export class Breadcrumb {
  /** Optional page title rendered above the trail. */
  readonly title = input<string>('');
  /** The crumb trail, in order; the last item is treated as the current page. */
  readonly items = input<readonly BreadcrumbItem[]>([]);
}
