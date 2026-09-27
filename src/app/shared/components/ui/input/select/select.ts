import { NgTemplateOutlet } from '@angular/common';
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
  viewChild,
} from '@angular/core';
import { ControlValueAccessor } from '@angular/forms';
import { FormValidation } from '../../../../directives/form-validation';
import { provideInputValueAccessor } from '../input';

let _uid = 0;

/** A single option after normalization, carrying its flat position in the visible list. */
interface NormalizedOption {
  /** The value patched into the form control when selected. */
  value: unknown;
  /** The text shown in the trigger and dropdown row. */
  label: string;
  disabled: boolean;
  /** Group key (only set when `groupBy` is configured). */
  group: unknown;
  /** Index into the flat, filtered list — drives keyboard navigation. */
  index: number;
}

/** Gap (px) between rendered tags — kept in sync with `.l-select__tags` gap. */
const TAG_GAP = 4;
/** Width (px) reserved for the "+N" overflow badge when measuring responsive tags. */
const TAG_BADGE_RESERVE = 46;

/** Fixed row height (px) the virtual scroller assumes for every option. */
const ROW_HEIGHT = 36;
/** Max dropdown viewport height (px) — roughly seven rows. */
const VIEWPORT_HEIGHT = 252;
/** Extra rows rendered above/below the viewport so fast scrolling stays smooth. */
const OVERSCAN = 4;

/**
 * Single-select dropdown inspired by Ant Design. Accepts a plain array of
 * primitives or an array of objects (mapped via `bindValue`/`bindLabel`),
 * supports optional in-place search, grouping, a loading state for async
 * search, and a windowed virtual scroller for large datasets.
 *
 * Bridges the selected value to a `ControlValueAccessor`, so it works with both
 * `[(ngModel)]` and reactive forms.
 */
@Component({
  selector: 'l-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  templateUrl: './select.html',
  styleUrl: './select.scss',
  providers: [provideInputValueAccessor(() => Select)],
  hostDirectives: [{ directive: FormValidation, inputs: ['useValidation'] }],
  host: {
    '(document:pointerdown)': '_onDocumentPointerDown($event)',
  },
})
export class Select implements ControlValueAccessor {
  readonly label = input<string>('');
  readonly placeholder = input<string>('Select…');
  readonly disabled = input<boolean>(false);
  readonly id = input<string>(`l-select-${_uid++}`);

  /** Allow selecting more than one option. The value becomes an array and the trigger shows tags. */
  readonly multiple = input(false);
  /** Cap the number of options that can be selected (multi-select only). Unset → unlimited. */
  readonly maxCount = input<number>();
  /**
   * How many tags to show before collapsing the rest into a "+N" badge (multi-select only).
   * `'responsive'` (default) fits as many tags as the trigger width allows; a number shows
   * exactly that many.
   */
  readonly maxTagCount = input<number | 'responsive'>('responsive');
  /** Show a clear (×) affix that empties the selection. */
  readonly clearable = input(false);

  /** Options to choose from — primitives (`string[]`/`number[]`) or objects. */
  readonly items = input<readonly unknown[]>([]);

  /** For object items: the property to use as the patched value. Unset → the whole item. */
  readonly bindValue = input<string>();
  /** For object items: the property to display. Unset → falls back to the value, then `String(item)`. */
  readonly bindLabel = input<string>();
  /** For object items: a truthy property that disables that single option. */
  readonly bindDisabled = input<string>();
  /** For object items: the property to group options by, rendered under sticky headers. */
  readonly groupBy = input<string>();

  /** Show an in-dropdown search box that filters options by label. */
  readonly searchable = input(false);
  /** Show the chevron affix on the right. */
  readonly showArrow = input(true);
  /** Replace the option list with a spinner — useful while an async `search` is in flight. */
  readonly showLoading = input(false);
  /** Render only the visible window of rows. Best for large, ungrouped lists. */
  readonly virtualScroll = input(false);

  /** Render the selected option label(s) as plain text instead of the select. */
  readonly viewMode = input(false);

  /** Custom text shown in view mode; falls back to the selected option label(s) when omitted. */
  readonly viewValue = input<string>();

  /** Emits the selected value whenever it changes. */
  readonly change = output<unknown>();
  /** Emits the search text on every keystroke — wire this to an API call for server-side search. */
  readonly search = output<string>();
  /** Emits when the option list scrolls near the bottom — append the next page to `items` for paged loading. */
  readonly scrollToEnd = output<void>();

  protected readonly _open = signal(false);
  protected readonly _searchText = signal('');
  protected readonly _activeIndex = signal(-1);
  protected readonly _scrollTop = signal(0);

  /** Latched once the list scrolls near the bottom so `scrollToEnd` emits once per approach. */
  private _endReached = false;

  protected readonly _value = signal<unknown>(null);
  protected readonly _disabledByForm = signal(false);
  protected readonly _touched = signal(false);

  protected readonly _isDisabled = computed(() => this.disabled() || this._disabledByForm());

  protected readonly _rowHeight = ROW_HEIGHT;

  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _dropdown = viewChild<ElementRef<HTMLElement>>('dropdown');
  private readonly _trigger = viewChild<ElementRef<HTMLElement>>('trigger');
  private readonly _searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly _viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly _tagsArea = viewChild<ElementRef<HTMLElement>>('tagsArea');
  private readonly _tagsMeasure = viewChild<ElementRef<HTMLElement>>('tagsMeasure');

  /** Number of tags that fit on one line — recomputed on resize / selection change (responsive mode). */
  private readonly _responsiveCount = signal(999);

  // Fixed-position dropdown coordinates (computed from the trigger rect so the
  // menu escapes any `overflow` clipping on ancestor elements and can flip up).
  protected readonly _dropUp = signal(false);
  protected readonly _menuLeft = signal(0);
  protected readonly _menuWidth = signal(0);
  protected readonly _menuTop = signal<number | null>(null);
  protected readonly _menuBottom = signal<number | null>(null);
  /** Max height of the scrollable option list, shrunk to fit the available space. */
  protected readonly _maxListHeight = signal(VIEWPORT_HEIGHT);

  private readonly _onViewportChange = (): void => {
    if (this._open()) this._reposition();
  };

  private _onChange: (value: unknown) => void = () => {};
  private _onTouched: () => void = () => {};

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const observer = new ResizeObserver(() => this._measureTags());
      observer.observe(this._host.nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
      this._measureTags();
    });

    // Re-measure whenever the rendered tags or the tag-count policy change.
    effect(() => {
      this._selectedOptions();
      this.maxTagCount();
      if (this._isResponsive()) {
        queueMicrotask(() => this._measureTags());
      }
    });

    // Portaled to <body> so an ancestor transform/filter (e.g. a drawer's or
    // modal's settled animation) can never re-anchor the fixed-position menu.
    // Emulated style encapsulation follows the element, and Angular removes the
    // node itself when the `@if` closes, so the move is safe.
    effect(() => {
      const dropdown = this._dropdown()?.nativeElement;
      if (dropdown && dropdown.parentElement !== document.body) {
        document.body.appendChild(dropdown);
      }
    });

    destroyRef.onDestroy(() => {
      window.removeEventListener('scroll', this._onViewportChange, true);
      window.removeEventListener('resize', this._onViewportChange);
    });
  }

  /** Selected values as a flat array, regardless of single/multi mode. */
  private readonly _selectedArray = computed<unknown[]>(() => {
    const value = this._value();
    return Array.isArray(value) ? value : [];
  });

  /** The normalized options currently selected, in selection order — drives the trigger tags. */
  protected readonly _selectedOptions = computed(() => {
    if (!this.multiple()) return [];
    const all = this._all();
    return this._selectedArray()
      .map((value) => all.find((o) => o.value === value))
      .filter((o): o is NormalizedOption => !!o);
  });

  protected readonly _isResponsive = computed(
    () => this.multiple() && this.maxTagCount() === 'responsive',
  );

  /** How many tags to render before the "+N" badge. */
  private readonly _visibleTagCount = computed(() => {
    const max = this.maxTagCount();
    return typeof max === 'number' ? max : this._responsiveCount();
  });

  protected readonly _shownTags = computed(() =>
    this._selectedOptions().slice(0, this._visibleTagCount()),
  );

  protected readonly _overflowCount = computed(
    () => this._selectedOptions().length - this._shownTags().length,
  );

  protected readonly _limitReached = computed(() => {
    const max = this.maxCount();
    return this.multiple() && max != null && this._selectedArray().length >= max;
  });

  protected readonly _hasValue = computed(() => {
    if (this.multiple()) return this._selectedArray().length > 0;
    const value = this._value();
    return value !== null && value !== undefined && value !== '';
  });

  protected readonly _showClear = computed(
    () => this.clearable() && this._hasValue() && !this._isDisabled(),
  );

  /** Every item normalized, in source order — the source of truth for the selected label. */
  private readonly _all = computed<NormalizedOption[]>(() =>
    this.items().map((item, index) => this._normalize(item, index)),
  );

  /** Options surviving the current search text, re-indexed to their rendered position. */
  protected readonly _visible = computed<NormalizedOption[]>(() => {
    const term = this.searchable() ? this._searchText().trim().toLowerCase() : '';
    const matched = term
      ? this._all().filter((o) => o.label.toLowerCase().includes(term))
      : this._all();
    return matched.map((o, index) => ({ ...o, index }));
  });

  protected readonly _groups = computed(() => {
    if (!this.groupBy()) return [];
    const groups = new Map<unknown, { label: string; options: NormalizedOption[] }>();
    for (const option of this._visible()) {
      let group = groups.get(option.group);
      if (!group) {
        group = { label: option.group == null ? '' : String(option.group), options: [] };
        groups.set(option.group, group);
      }
      group.options.push(option);
    }
    return [...groups.values()];
  });

  protected readonly _selectedLabel = computed(() => {
    const value = this._value();
    if (value === null || value === undefined) return '';
    return this._all().find((o) => o.value === value)?.label ?? '';
  });

  /** The selected option label(s) shown in view mode — comma-separated when multiple. */
  protected readonly _viewText = computed(() =>
    this.multiple()
      ? this._selectedOptions()
          .map((option) => option.label)
          .join(', ')
      : this._selectedLabel(),
  );

  protected readonly _useVirtual = computed(() => this.virtualScroll() && !this.groupBy());

  // --- Virtual scroll window ---

  protected readonly _totalHeight = computed(() => this._visible().length * ROW_HEIGHT);

  protected readonly _viewportHeight = computed(() =>
    Math.min(this._totalHeight(), this._maxListHeight()),
  );

  private readonly _startIndex = computed(() =>
    Math.max(0, Math.floor(this._scrollTop() / ROW_HEIGHT) - OVERSCAN),
  );

  protected readonly _window = computed(() => {
    const end = Math.min(
      this._visible().length,
      Math.ceil((this._scrollTop() + this._maxListHeight()) / ROW_HEIGHT) + OVERSCAN,
    );
    return this._visible().slice(this._startIndex(), end);
  });

  protected readonly _offsetTop = computed(() => this._startIndex() * ROW_HEIGHT);

  // --- Interaction ---

  protected _toggle(): void {
    if (this._isDisabled()) return;
    this._open() ? this._close() : this._openDropdown();
  }

  protected _onOptionClick(option: NormalizedOption): void {
    if (this._optionDisabled(option)) return;
    this._select(option.value);
  }

  protected _setActive(option: NormalizedOption): void {
    if (!this._optionDisabled(option)) this._activeIndex.set(option.index);
  }

  /** True when an option can't be picked — disabled at source, or the max-count limit is reached. */
  protected _optionDisabled(option: NormalizedOption): boolean {
    if (option.disabled) return true;
    return this._limitReached() && !this._isSelected(option.value);
  }

  protected _onSearch(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this._searchText.set(text);
    this.search.emit(text);
    this._scrollTop.set(0);
    this._endReached = false;
    this._activeIndex.set(this._firstSelectable());
  }

  protected _onScroll(event: Event): void {
    const list = event.target as HTMLElement;
    if (this._useVirtual()) this._scrollTop.set(list.scrollTop);

    // Appending a page grows scrollHeight, which un-latches for the next approach.
    const nearBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - ROW_HEIGHT;
    if (!nearBottom) {
      this._endReached = false;
    } else if (!this._endReached) {
      this._endReached = true;
      this.scrollToEnd.emit();
    }
  }

  /** True when the node lives in the trigger host or the body-portaled dropdown. */
  private _isInside(node: Node | null): boolean {
    if (!node) return false;
    return (
      this._host.nativeElement.contains(node) || !!this._dropdown()?.nativeElement.contains(node)
    );
  }

  protected _onDocumentPointerDown(event: PointerEvent): void {
    if (this._open() && !this._isInside(event.target as Node)) {
      this._close();
    }
  }

  protected _onKeydown(event: KeyboardEvent, fromSearch: boolean): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this._open() ? this._move(1) : this._openDropdown();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this._open() ? this._move(-1) : this._openDropdown();
        break;
      case 'Enter':
        event.preventDefault();
        this._open() ? this._selectActive() : this._openDropdown();
        break;
      case ' ':
        // The search box needs Space to type; elsewhere it opens/selects.
        if (fromSearch && this._open()) break;
        event.preventDefault();
        this._open() ? this._selectActive() : this._openDropdown();
        break;
      case 'Escape':
        if (this._open()) {
          event.preventDefault();
          this._close();
        }
        break;
      case 'Tab':
        this._close();
        break;
    }
  }

  protected _onBlur(event: FocusEvent): void {
    // Only a focus leaving the whole component counts as a blur for touched-state.
    if (!this._isInside(event.relatedTarget as Node)) {
      this._touched.set(true);
      this._onTouched();
    }
  }

  private _openDropdown(): void {
    if (this._isDisabled()) return;
    this._open.set(true);
    this._reposition();
    const selected = this._visible().findIndex((o) => o.value === this._value() && !o.disabled);
    this._activeIndex.set(selected >= 0 ? selected : this._firstSelectable());
    // Track the trigger position so the fixed menu stays anchored while scrolling.
    window.addEventListener('scroll', this._onViewportChange, true);
    window.addEventListener('resize', this._onViewportChange);
    // Wait for the dropdown to render before focusing the search box / scrolling.
    queueMicrotask(() => {
      this._reposition();
      this._searchInput()?.nativeElement.focus();
      this._scrollActiveIntoView();
    });
  }

  private _close(): void {
    if (!this._open()) return;
    this._open.set(false);
    this._searchText.set('');
    this._scrollTop.set(0);
    this._endReached = false;
    this._activeIndex.set(-1);
    window.removeEventListener('scroll', this._onViewportChange, true);
    window.removeEventListener('resize', this._onViewportChange);
  }

  /**
   * Position the fixed dropdown from the trigger's viewport rect. Anchors below
   * the trigger by default, flips above when there isn't room below, and caps
   * the option list height to the available space.
   */
  private _reposition(): void {
    const triggerEl = this._trigger()?.nativeElement;
    if (!triggerEl) return;

    const rect = triggerEl.getBoundingClientRect();
    const gap = 4;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const reserve = (this.searchable() ? 48 : 0) + 8; // search box + dropdown padding

    const dropUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const available = dropUp ? spaceAbove : spaceBelow;

    this._dropUp.set(dropUp);
    this._menuLeft.set(rect.left);
    this._menuWidth.set(rect.width);
    this._maxListHeight.set(Math.max(120, Math.min(VIEWPORT_HEIGHT, available - reserve)));

    if (dropUp) {
      this._menuTop.set(null);
      this._menuBottom.set(viewportHeight - rect.top + gap);
    } else {
      this._menuTop.set(rect.bottom + gap);
      this._menuBottom.set(null);
    }
  }

  private _select(value: unknown): void {
    if (this.multiple()) {
      const current = [...this._selectedArray()];
      const at = current.indexOf(value);
      if (at >= 0) {
        current.splice(at, 1);
      } else {
        const max = this.maxCount();
        if (max != null && current.length >= max) return;
        current.push(value);
      }
      this._value.set(current);
      this._onChange(current);
      this.change.emit(current);
      // Multi-select keeps the dropdown open so several picks can be made in a row.
      return;
    }

    this._value.set(value);
    this._onChange(value);
    this.change.emit(value);
    this._close();
    this._trigger()?.nativeElement.focus();
  }

  protected _removeTag(option: NormalizedOption, event: Event): void {
    event.stopPropagation();
    if (this._isDisabled()) return;
    this._select(option.value);
  }

  protected _clear(event: Event): void {
    event.stopPropagation();
    if (this._isDisabled()) return;
    const empty = this.multiple() ? [] : null;
    this._value.set(empty);
    this._onChange(empty);
    this.change.emit(empty);
    this._trigger()?.nativeElement.focus();
  }

  private _selectActive(): void {
    const option = this._visible()[this._activeIndex()];
    if (option && !this._optionDisabled(option)) this._select(option.value);
  }

  private _move(delta: number): void {
    const options = this._visible();
    if (!options.length) return;

    let next = this._activeIndex();
    for (let i = 0; i < options.length; i++) {
      next = (next + delta + options.length) % options.length;
      if (!this._optionDisabled(options[next])) {
        this._activeIndex.set(next);
        break;
      }
    }
    queueMicrotask(() => this._scrollActiveIntoView());
  }

  private _firstSelectable(): number {
    return this._visible().findIndex((o) => !this._optionDisabled(o));
  }

  private _measureTags(): void {
    if (!this._isResponsive()) return;
    const area = this._tagsArea()?.nativeElement;
    const measure = this._tagsMeasure()?.nativeElement;
    if (!area || !measure) return;

    const available = area.clientWidth;
    if (available <= 0) return;

    const tags = Array.from(measure.children) as HTMLElement[];
    let used = 0;
    let count = 0;
    for (let i = 0; i < tags.length; i++) {
      const width = tags[i].offsetWidth + (count > 0 ? TAG_GAP : 0);
      const reserve = i < tags.length - 1 ? TAG_BADGE_RESERVE + TAG_GAP : 0;
      if (count > 0 && used + width + reserve > available) break;
      used += width;
      count++;
    }
    this._responsiveCount.set(Math.max(1, count));
  }

  private _scrollActiveIntoView(): void {
    const viewport = this._viewport()?.nativeElement;
    const index = this._activeIndex();
    if (!viewport || index < 0) return;

    if (this._useVirtual()) {
      const top = index * ROW_HEIGHT;
      const bottom = top + ROW_HEIGHT;
      if (top < viewport.scrollTop) viewport.scrollTop = top;
      else if (bottom > viewport.scrollTop + viewport.clientHeight)
        viewport.scrollTop = bottom - viewport.clientHeight;
    } else {
      viewport
        .querySelector<HTMLElement>(`[data-index="${index}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    }
  }

  protected _isSelected(value: unknown): boolean {
    if (this.multiple()) return this._selectedArray().includes(value);
    const current = this._value();
    return current !== null && current !== undefined && value === current;
  }

  private _normalize(item: unknown, index: number): NormalizedOption {
    if (item !== null && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const valueKey = this.bindValue();
      const labelKey = this.bindLabel();
      const value = valueKey ? record[valueKey] : item;
      const label = labelKey
        ? String(record[labelKey] ?? '')
        : String((valueKey ? value : undefined) ?? item);
      const disabledKey = this.bindDisabled();
      const groupKey = this.groupBy();
      return {
        value,
        label,
        disabled: disabledKey ? !!record[disabledKey] : false,
        group: groupKey ? record[groupKey] : undefined,
        index,
      };
    }
    return { value: item, label: String(item), disabled: false, group: undefined, index };
  }

  writeValue(value: unknown): void {
    if (this.multiple()) {
      this._value.set(Array.isArray(value) ? value : value == null ? [] : [value]);
    } else {
      this._value.set(value ?? null);
    }
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
