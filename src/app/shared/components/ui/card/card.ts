import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  input,
} from '@angular/core';

export type CardVariant = 'default' | 'dark';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';
export type CardShadow = 'none' | 'sm' | 'md' | 'lg';

/**
 * A surface container for grouping related content — the shared page-section
 * style as a component. Optional header (`title` input, left) with a
 * `[card-extra]` slot on its right, a `[card-footer]` slot below a divider,
 * and `padding`, `shadow`, `bordered` and `hoverable` presentation inputs.
 *
 * ```html
 * <l-card title="Project settings" shadow="sm">
 *   <l-button card-extra variant="ghost" size="sm">Edit</l-button>
 *   Body content.
 *   <span card-footer>Updated 2 days ago</span>
 * </l-card>
 * ```
 */
@Component({
  selector: 'l-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './card.html',
  styleUrl: './card.scss',
  // Unscoped on purpose: the header/footer collapse when nothing is projected
  // into them, which needs :empty/:has against the projected content — that
  // content belongs to the consumer's scope, so emulated encapsulation can't
  // reach it. Class names are component-prefixed to stay collision-free.
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': '_hostClasses()',
  },
})
export class Card {
  /** Surface tint — `dark` uses the darker section background. */
  readonly variant = input<CardVariant>('default');

  /** Inner padding of each region: `none` 0, `sm` 8, `md` 12, `lg` 20 (px). */
  readonly padding = input<CardPadding>('md');

  /** Drop-shadow strength. */
  readonly shadow = input<CardShadow>('none');

  /** Show the 1px border around the card. */
  readonly bordered = input(true);

  /** Lift the card and add a shadow on hover — for clickable cards. */
  readonly hoverable = input(false);

  /** Header title, rendered on the left. Adding it (or `[card-extra]` content) shows the header. */
  readonly title = input('');

  protected readonly _hostClasses = computed(() =>
    [
      'lui-card',
      this.variant() === 'dark' ? 'lui-card-dark' : '',
      `lui-card-pad-${this.padding()}`,
      this.shadow() !== 'none' ? `lui-card-shadow-${this.shadow()}` : '',
      this.bordered() ? '' : 'lui-card-borderless',
      this.hoverable() ? 'lui-card-hoverable' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
}
