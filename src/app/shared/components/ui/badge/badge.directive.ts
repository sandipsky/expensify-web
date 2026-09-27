import {
  ComponentRef,
  Directive,
  ElementRef,
  Renderer2,
  ViewContainerRef,
  afterNextRender,
  booleanAttribute,
  effect,
  inject,
  input,
  numberAttribute,
  output,
} from '@angular/core';
import { Badge, BadgeSize } from './badge';

/**
 * Attaches a count badge to the host element — drop it on a button, icon,
 * avatar, or any element that can contain a child and tolerate
 * `position: relative`.
 *
 * ```html
 * <button [lBadge]="unread()" lBadgeColor="var(--accent)" [lBadgeDynamic]="true">
 *   🔔
 * </button>
 * ```
 *
 * The bubble is rendered by an internal {@link Badge} component appended into
 * the host and positioned at its top-right corner. Inputs are prefixed with
 * `lBadge` to avoid clashing with native attributes (e.g. `size`, `color`).
 */
@Directive({
  selector: '[lBadge]',
})
export class BadgeDirective {
  /** The count. Hidden at 0 unless `lBadgeShowZero` is set. */
  readonly lBadge = input<number | null>(null);
  /** Any CSS color or token; defaults to the badge red shade. */
  readonly lBadgeColor = input<string>('');
  readonly lBadgeSize = input<BadgeSize>('md');
  /** Show `N+` once the count passes this. Default 99. */
  readonly lBadgeOverflowCount = input(99, { transform: numberAttribute });
  readonly lBadgeShowZero = input(false, { transform: booleanAttribute });
  /** Animate (pop) whenever the count changes. */
  readonly lBadgeDynamic = input(false, { transform: booleanAttribute });

  /** Emits when the badge bubble is clicked (does not trigger the host's click). */
  readonly lBadgeClick = output<MouseEvent>();

  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _vcr = inject(ViewContainerRef);
  private readonly _renderer = inject(Renderer2);
  private readonly _ref: ComponentRef<Badge> = this._vcr.createComponent(Badge);

  constructor() {
    // Move the bubble inside the host so absolute positioning anchors to it.
    this._renderer.appendChild(this._host.nativeElement, this._ref.location.nativeElement);
    this._ref.instance.clicked.subscribe((event) => this.lBadgeClick.emit(event));

    // Make the host a positioning context unless it already is one.
    afterNextRender(() => {
      const host = this._host.nativeElement;
      if (getComputedStyle(host).position === 'static') {
        this._renderer.setStyle(host, 'position', 'relative');
      }
    });

    // Push directive inputs into the bubble component reactively.
    effect(() => {
      this._ref.setInput('count', this.lBadge());
      this._ref.setInput('color', this.lBadgeColor());
      this._ref.setInput('size', this.lBadgeSize());
      this._ref.setInput('overflowCount', this.lBadgeOverflowCount());
      this._ref.setInput('showZero', this.lBadgeShowZero());
      this._ref.setInput('dynamic', this.lBadgeDynamic());
    });
  }
}
