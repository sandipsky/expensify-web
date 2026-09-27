import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** The resolved side the bubble sits on relative to its trigger. */
export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

/**
 * The floating tooltip bubble. This is the presentational piece — it renders the
 * text and the arrow and fades in/out via the `visible` flag. Positioning and
 * trigger wiring live in {@link TooltipDirective}; you normally never place this
 * element yourself, you apply `[lTooltip]` to a target instead.
 */
@Component({
  selector: 'l-tooltip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tooltip.html',
  styleUrl: './tooltip.scss',
  host: {
    class: 'l-tooltip',
    role: 'tooltip',
    '[id]': 'id()',
    '[class.l-tooltip--top]': "side() === 'top'",
    '[class.l-tooltip--bottom]': "side() === 'bottom'",
    '[class.l-tooltip--left]': "side() === 'left'",
    '[class.l-tooltip--right]': "side() === 'right'",
    '[class.is-visible]': 'visible()',
  },
})
export class Tooltip {
  readonly content = input<string>('');
  readonly side = input<TooltipSide>('top');
  readonly arrow = input(true);
  readonly visible = input(false);
  readonly id = input<string>('');

  protected readonly _showArrow = computed(() => this.arrow());
}
