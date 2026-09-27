import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Placeholder shown while content loads — inspired by Mantine's `Skeleton`.
 *
 * Use it standalone as a sized block (`height`/`width`/`radius`, or `circle`)
 * or wrap real content and toggle `visible`: while `visible` is true an opaque,
 * pulsing overlay covers the projected content; once false the content shows.
 *
 * ```html
 * <l-skeleton height="1rem" width="60%" />
 * <l-skeleton [circle]="true" height="48px" />
 *
 * <l-skeleton [visible]="loading()">
 *   <p>Real content, revealed when loading finishes.</p>
 * </l-skeleton>
 * ```
 */
@Component({
  selector: 'l-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  styleUrl: './skeleton.scss',
  host: {
    '[attr.data-visible]': 'visible() ? "" : null',
    '[attr.data-animate]': 'visible() && animate() ? "" : null',
    '[attr.aria-hidden]': 'visible() ? "true" : null',
    '[style.width]': '_width()',
    '[style.height]': 'height()',
    '[style.border-radius]': '_radius()',
  },
})
export class Skeleton {
  /** Width as any CSS length, e.g. '100%', '240px'. Ignored when `circle` is set. */
  readonly width = input<string>('100%');
  /** Height as any CSS length. Required for standalone blocks and for `circle`. */
  readonly height = input<string>();
  /** Corner radius (any CSS length). Overridden to a full circle when `circle` is set. */
  readonly radius = input<string>('8px');
  /** Render a circle: width follows `height` and the radius becomes 50%. */
  readonly circle = input(false);
  /** Play the pulsing animation. Default: true. */
  readonly animate = input(true);
  /** Show the skeleton overlay (true) or reveal the projected content (false). */
  readonly visible = input(true);

  protected readonly _width = computed(() => (this.circle() ? this.height() : this.width()));
  protected readonly _radius = computed(() => (this.circle() ? '50%' : this.radius()));
}
