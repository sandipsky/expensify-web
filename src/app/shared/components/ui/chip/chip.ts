import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export type ChipVariant = 'default' | 'primary' | 'success' | 'error' | 'warn' | 'info' | 'premium';
export type ChipSize = 'sm' | 'md' | 'lg';

/**
 * Pill-shaped label for statuses, tags and filters. Tinted per `variant`, with
 * an optional leading status `dot` and an optional remove button (`removable`
 * + `(removed)`) for dismissible tags.
 *
 * ```html
 * <l-chip variant="success" [dot]="true">Active</l-chip>
 * <l-chip [removable]="true" (removed)="onRemove()">Angular</l-chip>
 * ```
 */
@Component({
  selector: 'l-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chip.html',
  styleUrl: './chip.scss',
  host: {
    '[class]': '_hostClasses()',
  },
})
export class Chip {
  readonly variant = input<ChipVariant>('default');
  readonly size = input<ChipSize>('md');
  /** Show a leading dot in the variant color. */
  readonly dot = input(false);
  /** Show a remove button; pressing it emits `removed`. */
  readonly removable = input(false);
  /** Accessible label for the remove button. */
  readonly removeLabel = input('Remove');

  readonly removed = output<void>();

  protected readonly _hostClasses = computed(
    () => `l-chip l-chip--${this.variant()} l-chip--${this.size()}`,
  );
}
