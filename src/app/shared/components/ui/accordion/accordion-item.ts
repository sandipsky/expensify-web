import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Accordion } from './accordion';

let _uid = 0;

/**
 * A single collapsible section inside an {@link Accordion}. Renders a header
 * button and a panel whose content is projected via `<ng-content>`. Open state
 * is owned by the parent accordion; this component only reflects it.
 */
@Component({
  selector: 'l-accordion-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './accordion-item.html',
  styleUrl: './accordion-item.scss',
  host: {
    '[class]': '_hostClasses()',
  },
})
export class AccordionItem implements OnInit, OnDestroy {
  /** Header text. For richer headers, project content into the `title` slot instead. */
  readonly title = input<string>('');
  /** Disable toggling; the header is skipped by keyboard navigation. */
  readonly disabled = input(false);
  /** Whether this item starts open (applied once, when it registers with the accordion). */
  readonly expanded = input(false);
  readonly id = input<string>(`l-accordion-item-${_uid++}`);

  /** Emits the new open state whenever this item expands or collapses. */
  readonly openedChange = output<boolean>();

  private readonly _accordion = inject(Accordion);
  private readonly _header = viewChild.required<ElementRef<HTMLButtonElement>>('header');

  protected readonly _open = computed(() => this._accordion._isOpen(this));
  protected readonly _iconPosition = computed(() => this._accordion.iconPosition());

  protected readonly _hostClasses = computed(
    () => `l-accordion-item l-accordion-item--${this._accordion.variant()}`,
  );

  private _emitted = false;

  constructor() {
    effect(() => {
      const open = this._open();
      // Skip the initial computed read so we only emit on real transitions.
      if (this._emitted) {
        this.openedChange.emit(open);
      } else {
        this._emitted = true;
      }
    });
  }

  ngOnInit(): void {
    this._accordion._register(this);
  }

  ngOnDestroy(): void {
    this._accordion._unregister(this);
  }

  protected _toggle(): void {
    this._accordion._toggle(this);
  }

  protected _onKeydown(event: KeyboardEvent): void {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      this._accordion._moveFocus(this, event.key);
    }
  }

  /** @internal Called by the parent accordion for roving focus. */
  _focusHeader(): void {
    this._header().nativeElement.focus();
  }
}
