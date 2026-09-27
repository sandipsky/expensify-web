import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';

export type BadgeSize = 'sm' | 'md' | 'lg';

/**
 * The badge bubble itself — rendered and positioned by {@link BadgeDirective},
 * not used directly in templates. Shows a count (with `overflowCount` → `N+`),
 * hides at zero unless `showZero`, and pops when the count changes if `dynamic`.
 */
@Component({
  selector: 'l-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '{{ _display() }}',
  styleUrl: './badge.scss',
  host: {
    '[class]': '_hostClasses()',
    '[class.is-hidden]': '!_visible()',
    '[class.is-pop]': '_pop()',
    '[style.--l-badge-color]': 'color() || null',
    '(click)': '_onClick($event)',
    '(animationend)': '_pop.set(false)',
    'aria-hidden': 'true',
  },
})
export class Badge {
  readonly count = input<number | null>(null);
  /** Any CSS color or token; empty falls back to the default red shade. */
  readonly color = input<string>('');
  readonly size = input<BadgeSize>('md');
  readonly overflowCount = input<number>(99);
  readonly showZero = input(false);
  /** Play a pop animation whenever the count changes. */
  readonly dynamic = input(false);

  readonly clicked = output<MouseEvent>();

  protected readonly _pop = signal(false);

  protected readonly _count = computed(() => this.count() ?? 0);

  protected readonly _visible = computed(() => this._count() !== 0 || this.showZero());

  protected readonly _display = computed(() => {
    const count = this._count();
    const max = this.overflowCount();
    return count > max ? `${max}+` : `${count}`;
  });

  protected readonly _hostClasses = computed(() => `l-badge l-badge--${this.size()}`);

  constructor() {
    let previous = this.count();
    effect(() => {
      const current = this.count();
      if (this.dynamic() && current !== previous) {
        // Retrigger the CSS animation: drop the class, re-add next microtask.
        this._pop.set(false);
        queueMicrotask(() => this._pop.set(true));
      }
      previous = current;
    });
  }

  protected _onClick(event: MouseEvent): void {
    // Don't let a badge click also fire the underlying element's click.
    event.stopPropagation();
    this.clicked.emit(event);
  }
}
