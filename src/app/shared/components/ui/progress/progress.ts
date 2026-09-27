import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ProgressVariant = 'accent' | 'success' | 'warn' | 'error';

/**
 * Horizontal progress bar for ratios such as budget use or credit utilization.
 * `value` is a percentage: the bar stops at 100, while the ARIA value keeps the
 * real figure, so 130% is announced as 130% over a full bar.
 *
 * ```html
 * <l-progress [value]="86" variant="warn" label="Food budget used" />
 * ```
 */
@Component({
  selector: 'l-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<span class="l-progress__bar" [style.width.%]="_width()"></span>',
  styleUrl: './progress.scss',
  host: {
    '[class]': '_hostClasses()',
    role: 'progressbar',
    'aria-valuemin': '0',
    '[attr.aria-valuemax]': '_max()',
    '[attr.aria-valuenow]': '_now()',
    '[attr.aria-valuetext]': '_now() + "%"',
    '[attr.aria-label]': 'label() || null',
  },
})
export class Progress {
  /** Percentage filled. Values over 100 fill the bar; negatives count as 0. */
  readonly value = input(0);
  readonly variant = input<ProgressVariant>('accent');
  /** Accessible name, e.g. "Credit used". */
  readonly label = input('');

  protected readonly _hostClasses = computed(() => `l-progress l-progress--${this.variant()}`);
  protected readonly _now = computed(() => Math.round(Math.max(0, this.value())));
  protected readonly _max = computed(() => Math.max(100, this._now()));
  protected readonly _width = computed(() => Math.min(100, Math.max(0, this.value())));
}
