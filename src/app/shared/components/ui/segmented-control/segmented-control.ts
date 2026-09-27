import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChildren,
} from '@angular/core';
import { ControlValueAccessor } from '@angular/forms';
import { provideInputValueAccessor } from '../input/input';

export type SegmentedOrientation = 'horizontal' | 'vertical';
export type SegmentedSize = 'sm' | 'md' | 'lg';

export interface SegmentedOption {
  label: string;
  value: unknown;
  disabled?: boolean;
}

let _uid = 0;

/**
 * Segmented control — a single-select switch rendered as a row (or column) of
 * connected buttons, like iOS / Ant Design `Segmented`. Accepts plain strings
 * or `{ label, value, disabled }` objects, bridges to `ControlValueAccessor`
 * (so it works with `[(ngModel)]` and reactive forms), and follows the WAI-ARIA
 * radio-group keyboard pattern.
 *
 * ```html
 * <l-segmented-control [options]="['Daily', 'Weekly', 'Monthly']" [(ngModel)]="range" />
 * <l-segmented-control [options]="opts" orientation="vertical" [(ngModel)]="view" />
 * ```
 */
@Component({
  selector: 'l-segmented-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './segmented-control.html',
  styleUrl: './segmented-control.scss',
  providers: [provideInputValueAccessor(() => SegmentedControl)],
  host: {
    '[class]': '_hostClasses()',
    role: 'radiogroup',
    '[attr.aria-orientation]': 'orientation()',
    '[attr.aria-disabled]': '_isDisabled() || null',
  },
})
export class SegmentedControl implements ControlValueAccessor {
  /** Options to choose from — plain strings or `{ label, value, disabled }` objects. */
  readonly options = input<readonly (string | SegmentedOption)[]>([]);
  readonly orientation = input<SegmentedOrientation>('horizontal');
  readonly size = input<SegmentedSize>('md');
  /** Disable the whole control. */
  readonly disabled = input(false);
  /** Stretch to the container width with equal-width segments. */
  readonly fullWidth = input(false);
  readonly name = input<string>(`l-segmented-${_uid++}`);

  /** Emits the selected value when it changes. */
  readonly change = output<unknown>();

  protected readonly _value = signal<unknown>(null);
  protected readonly _disabledByForm = signal(false);

  protected readonly _isDisabled = computed(() => this.disabled() || this._disabledByForm());

  private readonly _segments = viewChildren<ElementRef<HTMLButtonElement>>('segment');
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Geometry of the sliding thumb behind the selected segment. */
  protected readonly _thumb = signal({ x: 0, y: 0, width: 0, height: 0, visible: false });
  /** Gate the slide transition on until after the first paint (avoid a flash from 0,0). */
  protected readonly _ready = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Re-place the thumb whenever the selection, options or layout change.
    effect(() => {
      this._value();
      this._options();
      this.orientation();
      this.size();
      this.fullWidth();
      queueMicrotask(() => this._positionThumb());
    });

    afterNextRender(() => {
      this._positionThumb();
      requestAnimationFrame(() => this._ready.set(true));

      const observer = new ResizeObserver(() => this._positionThumb());
      observer.observe(this._host.nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  private _positionThumb(): void {
    const options = this._options();
    const index = options.findIndex((o) => o.value === this._value() && !o.disabled);
    const segment = this._segments()[index]?.nativeElement;
    if (index < 0 || !segment) {
      this._thumb.update((t) => ({ ...t, visible: false }));
      return;
    }
    this._thumb.set({
      x: segment.offsetLeft,
      y: segment.offsetTop,
      width: segment.offsetWidth,
      height: segment.offsetHeight,
      visible: true,
    });
  }

  protected readonly _options = computed<SegmentedOption[]>(() =>
    this.options().map((option) =>
      option !== null && typeof option === 'object'
        ? { label: option.label, value: option.value, disabled: !!option.disabled }
        : { label: String(option), value: option, disabled: false },
    ),
  );

  /** The single segment that is keyboard-tabbable (the selected one, else the first enabled). */
  protected readonly _tabbableValue = computed(() => {
    const options = this._options();
    const selected = options.find((o) => o.value === this._value() && !o.disabled);
    return (selected ?? options.find((o) => !o.disabled))?.value;
  });

  protected readonly _hostClasses = computed(() => {
    const classes = [
      'l-segmented',
      `l-segmented--${this.orientation()}`,
      `l-segmented--${this.size()}`,
    ];
    if (this.fullWidth()) classes.push('l-segmented--full');
    if (this._isDisabled()) classes.push('is-disabled');
    return classes.join(' ');
  });

  private _onChange: (value: unknown) => void = () => {};
  private _onTouched: () => void = () => {};

  protected _isSelected(value: unknown): boolean {
    return this._value() === value;
  }

  protected _select(option: SegmentedOption): void {
    if (this._isDisabled() || option.disabled || this._value() === option.value) return;
    this._value.set(option.value);
    this._onChange(option.value);
    this._onTouched();
    this.change.emit(option.value);
  }

  protected _onKeydown(event: KeyboardEvent, index: number): void {
    const horizontal = this.orientation() === 'horizontal';
    let target = -1;
    switch (event.key) {
      case horizontal ? 'ArrowRight' : 'ArrowDown':
        target = this._nextEnabled(index, 1);
        break;
      case horizontal ? 'ArrowLeft' : 'ArrowUp':
        target = this._nextEnabled(index, -1);
        break;
      case 'Home':
        target = this._nextEnabled(-1, 1);
        break;
      case 'End':
        target = this._nextEnabled(this._options().length, -1);
        break;
      default:
        return;
    }
    if (target < 0) return;
    event.preventDefault();
    this._select(this._options()[target]);
    this._segments()[target]?.nativeElement.focus();
  }

  private _nextEnabled(from: number, direction: number): number {
    const options = this._options();
    const count = options.length;
    for (let step = 1; step <= count; step++) {
      const index = (from + direction * step + count * 2) % count;
      if (!options[index].disabled) return index;
    }
    return -1;
  }

  writeValue(value: unknown): void {
    this._value.set(value ?? null);
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this._onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this._onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this._disabledByForm.set(isDisabled);
  }
}
