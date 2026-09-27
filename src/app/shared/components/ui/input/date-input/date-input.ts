import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor } from '@angular/forms';
import { FormValidation } from '../../../../directives/form-validation';
import { provideInputValueAccessor } from '../input';
import NepaliDate from './lib/nepali-date-converter';
import { dateConfigMap } from './lib/date-config';
import { format as formatBs, formatObj, parse as parseDateString } from './lib/nepali-date-helper';

let _uid = 0;

export type CalendarSystem = 'ad' | 'bs';

/** One cell of the 6×7 day grid. */
interface DayCell {
  key: number;
  label: string;
  /** AD date at local midnight — `null` only for cells outside the convertible BS range. */
  date: Date | null;
  aria: string;
  inMonth: boolean;
  today: boolean;
  selected: boolean;
  active: boolean;
  disabled: boolean;
}

interface MonthCell {
  index: number;
  label: string;
  selected: boolean;
}

interface YearCell {
  year: number;
  label: string;
  selected: boolean;
  disabled: boolean;
}

const AD_MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const AD_MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const AD_DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const AD_DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// The BS↔AD conversion table covers 2000–2090 BS; both calendars are clamped to
// that window so the AD/BS toggle can never land on an unconvertible month.
const BS_YEAR_MIN = 2000;
const BS_YEAR_MAX = 2090;
const AD_YEAR_MIN = 1944;
const AD_YEAR_MAX = 2033;

const PANEL_WIDTH = 288;
/** Rough panel height used to decide whether the popup should flip above the trigger. */
const PANEL_HEIGHT = 356;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** AD counterpart of the lib's BS `format()` — same token set, English names. */
function formatAd(date: Date, formatString: string): string {
  return formatString
    .replace(/((\\[MDYd])|D{1,2}|M{1,4}|Y{2,4}|d{1,3})/g, (match, _, escaped) => {
      switch (match) {
        case 'D':
          return String(date.getDate());
        case 'DD':
          return String(date.getDate()).padStart(2, '0');
        case 'M':
          return String(date.getMonth() + 1);
        case 'MM':
          return String(date.getMonth() + 1).padStart(2, '0');
        case 'MMM':
          return AD_MONTHS_SHORT[date.getMonth()];
        case 'MMMM':
          return AD_MONTHS_LONG[date.getMonth()];
        case 'YY':
          return String(date.getFullYear()).slice(-2);
        case 'YYY':
          return String(date.getFullYear()).slice(-3);
        case 'YYYY':
          return String(date.getFullYear());
        case 'd':
          return String(date.getDay());
        case 'dd':
          return AD_DAYS_SHORT[date.getDay()];
        case 'ddd':
          return AD_DAYS_LONG[date.getDay()];
        default:
          return escaped.replace('\\', '');
      }
    })
    .replace(/\\/g, '');
}

/**
 * Date picker input inspired by Ant Design, with a twist for Nepal: the popup
 * calendar renders in either the Gregorian (AD) or Bikram Sambat (BS) system
 * and carries an AD/BS toggle so users can switch on the fly.
 *
 * The model value is always a JS `Date` (local midnight), regardless of which
 * calendar is displayed — so forms stay calendar-agnostic. Typing is supported
 * (`YYYY-MM-DD`, `YYYY/MM/DD`, `DD-MM-YYYY`, …) and parsed in the active
 * calendar. Bridges to a `ControlValueAccessor`, so it works with both
 * `[(ngModel)]` and reactive forms.
 */
@Component({
  selector: 'l-date-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './date-input.html',
  styleUrl: './date-input.scss',
  providers: [provideInputValueAccessor(() => DateInput)],
  hostDirectives: [{ directive: FormValidation, inputs: ['useValidation'] }],
  host: {
    '(document:pointerdown)': '_onDocumentPointerDown($event)',
  },
})
export class DateInput implements ControlValueAccessor {
  readonly label = input<string>('');
  readonly placeholder = input<string>('Select date');
  readonly disabled = input<boolean>(false);
  readonly id = input<string>(`l-date-input-${_uid++}`);

  /** Calendar system the picker starts in. The popup toggle can switch it later. */
  readonly calendar = input<CalendarSystem>('ad');
  /** Display language for the BS calendar — `np` renders Nepali month names and digits. */
  readonly lang = input<'en' | 'np'>('en');
  /** Display format, using the lib's tokens (`YYYY`, `MM`, `DD`, `MMMM`, `dd`, …). */
  readonly format = input<string>('YYYY-MM-DD');
  /** Show the "Today" shortcut in the popup footer. */
  readonly showToday = input(true);
  /** Open the calendar as soon as the input gains focus (e.g. when tabbing in). */
  readonly openCalendarOnFocus = input(false);
  /** Show the calendar affix icon. */
  readonly showCalendarIcon = input(true);
  /** Allow editing the date by typing. `false` makes the field picker-only (read-only text). */
  readonly typableDateInput = input(true);
  /** Show a clear (×) affix when a date is picked. */
  readonly clearable = input(true);
  /** Earliest selectable date (inclusive). `Date` or anything `new Date()` accepts. */
  readonly min = input<Date | string | null>(null);
  /** Latest selectable date (inclusive). */
  readonly max = input<Date | string | null>(null);

  /** Render the formatted date as plain text instead of the picker. */
  readonly viewMode = input(false);

  /** Custom text shown in view mode; falls back to the formatted date when omitted. */
  readonly viewValue = input<string>();

  /** Emits the picked date (local midnight) or `null` when cleared. */
  readonly change = output<Date | null>();
  /** Emits when the user flips the AD/BS toggle. */
  readonly calendarChange = output<CalendarSystem>();

  protected readonly _mode = linkedSignal(() => this.calendar());
  protected readonly _view = signal<'date' | 'month' | 'year'>('date');
  protected readonly _open = signal(false);

  // View anchor, expressed in the active calendar system (BS months while in BS mode).
  protected readonly _viewYear = signal(0);
  protected readonly _viewMonth = signal(0);

  /** Keyboard-navigation cursor — always an AD date, like the model value. */
  private readonly _activeDate = signal<Date | null>(null);

  protected readonly _value = signal<Date | null>(null);
  protected readonly _disabledByForm = signal(false);
  protected readonly _touched = signal(false);
  /** Raw text while the user is typing; `null` means "show the formatted value". */
  protected readonly _typedText = signal<string | null>(null);

  private readonly _todayTime = signal(startOfDay(new Date()).getTime());

  protected readonly _isDisabled = computed(() => this.disabled() || this._disabledByForm());

  // Fixed-position panel coordinates (same approach as l-select: computed from the
  // trigger rect so the popup escapes ancestor `overflow` clipping and can flip up).
  protected readonly _dropUp = signal(false);
  protected readonly _panelLeft = signal(0);
  protected readonly _panelTop = signal<number | null>(null);
  protected readonly _panelBottom = signal<number | null>(null);

  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _trigger = viewChild<ElementRef<HTMLElement>>('trigger');
  private readonly _field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly _grid = viewChild<ElementRef<HTMLElement>>('grid');

  private readonly _onViewportChange = (): void => {
    if (this._open()) this._reposition();
  };

  /** Suppresses `openCalendarOnFocus` when we refocus the field programmatically. */
  private _skipFocusOpen = false;

  private _onChange: (value: Date | null) => void = () => {};
  private _onTouched: () => void = () => {};

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('scroll', this._onViewportChange, true);
      window.removeEventListener('resize', this._onViewportChange);
    });
  }

  // --- Derived state ---

  private readonly _minTime = computed(() => this._boundTime(this.min()));
  private readonly _maxTime = computed(() => this._boundTime(this.max()));

  protected readonly _hasValue = computed(() => this._value() !== null);

  protected readonly _showClear = computed(
    () => this.clearable() && this._hasValue() && !this._isDisabled(),
  );

  protected readonly _displayValue = computed(() => {
    const typed = this._typedText();
    if (typed !== null) return typed;
    const value = this._value();
    if (!value) return '';
    if (this._mode() === 'bs') {
      try {
        return new NepaliDate(value).format(this.format(), this.lang());
      } catch {
        // Value outside the BS table — fall back to the AD rendering.
      }
    }
    return formatAd(value, this.format());
  });

  protected readonly _weekdays = computed(() =>
    this._mode() === 'bs' && this.lang() === 'np' ? formatObj.np.day.short : WEEKDAYS,
  );

  protected readonly _headerMonthLabel = computed(() =>
    this._mode() === 'bs'
      ? formatObj[this.lang()].month.long[this._viewMonth()]
      : AD_MONTHS_SHORT[this._viewMonth()],
  );

  protected readonly _headerYearLabel = computed(() => this._yearLabel(this._viewYear()));

  protected readonly _yearPageStart = computed(() => Math.floor(this._viewYear() / 12) * 12);

  protected readonly _yearRangeLabel = computed(() => {
    const start = this._yearPageStart();
    return `${this._yearLabel(start)} – ${this._yearLabel(start + 11)}`;
  });

  protected readonly _cells = computed<DayCell[]>(() => {
    const mode = this._mode();
    const year = this._viewYear();
    const month = this._viewMonth();
    const first = mode === 'bs' ? this._bsToJs(year, month, 1) : new Date(year, month, 1);
    if (!first) return [];

    const startOffset = first.getDay();
    const selectedTime = this._value()?.getTime() ?? null;
    const activeTime = this._activeDate()?.getTime() ?? null;
    const todayTime = this._todayTime();

    const cells: DayCell[] = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(
        first.getFullYear(),
        first.getMonth(),
        first.getDate() + i - startOffset,
      );
      const time = date.getTime();

      let label: string;
      let aria: string;
      let inMonth: boolean;
      let convertible = true;

      if (mode === 'bs') {
        const bs = this._toBs(date);
        if (bs) {
          label = formatBs(bs, 'D', this.lang());
          aria = formatBs(bs, 'DD MMMM YYYY', this.lang());
          inMonth = bs.year === year && bs.month === month;
        } else {
          label = '';
          aria = '';
          inMonth = false;
          convertible = false;
        }
      } else {
        label = String(date.getDate());
        aria = formatAd(date, 'DD MMMM YYYY');
        inMonth = date.getMonth() === month;
      }

      cells.push({
        key: i,
        label,
        date: convertible ? date : null,
        aria,
        inMonth,
        today: time === todayTime,
        selected: selectedTime !== null && time === selectedTime,
        active: activeTime !== null && time === activeTime,
        disabled: !convertible || this._outOfRange(time),
      });
    }
    return cells;
  });

  protected readonly _monthCells = computed<MonthCell[]>(() => {
    const names = this._mode() === 'bs' ? formatObj[this.lang()].month.long : AD_MONTHS_SHORT;
    return names.map((label, index) => ({
      index,
      label,
      selected: index === this._viewMonth(),
    }));
  });

  protected readonly _yearCells = computed<YearCell[]>(() => {
    const start = this._yearPageStart();
    const [minYear, maxYear] = this._yearBounds();
    return Array.from({ length: 12 }, (_, i) => {
      const year = start + i;
      return {
        year,
        label: this._yearLabel(year),
        selected: year === this._viewYear(),
        disabled: year < minYear || year > maxYear,
      };
    });
  });

  // --- Trigger interaction ---

  protected _onTriggerClick(): void {
    if (this._isDisabled()) return;
    this._openPanel();
    this._field()?.nativeElement.focus();
  }

  protected _onFocus(): void {
    if (this._skipFocusOpen) return;
    if (this.openCalendarOnFocus() && !this._isDisabled()) this._openPanel();
  }

  protected _onTyped(event: Event): void {
    const field = event.target as HTMLInputElement;
    if (!this.typableDateInput()) {
      field.value = this._displayValue();
      return;
    }
    // Only date-shaped text is accepted: digits plus the separators the parser
    // understands (`/`, `-`, space), capped at YYYY-MM-DD length.
    const sanitized = field.value.replace(/[^\d/\- ]/g, '').slice(0, 10);
    if (sanitized !== field.value) {
      const caret = Math.max(
        0,
        (field.selectionStart ?? sanitized.length) - (field.value.length - sanitized.length),
      );
      field.value = sanitized;
      field.setSelectionRange(caret, caret);
    }
    this._typedText.set(sanitized);
    if (!this._open()) this._openPanel();
  }

  protected _onInputKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        this._commitTyped();
        this._close();
        break;
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (!this._open()) this._openPanel();
        queueMicrotask(() => this._grid()?.nativeElement.focus());
        break;
      case 'Escape':
        if (this._open()) {
          event.preventDefault();
          this._typedText.set(null);
          this._close(false);
        }
        break;
      case 'Tab':
        this._commitTyped();
        this._close(false);
        break;
    }
  }

  protected _onBlur(event: FocusEvent): void {
    // Only a focus leaving the whole component counts — the panel lives inside the host.
    if (!this._host.nativeElement.contains(event.relatedTarget as Node)) {
      this._commitTyped();
      this._close(false);
      this._touched.set(true);
      this._onTouched();
    }
  }

  protected _onDocumentPointerDown(event: PointerEvent): void {
    if (this._open() && !this._host.nativeElement.contains(event.target as Node)) {
      this._commitTyped();
      this._close(false);
    }
  }

  protected _clear(event: Event): void {
    event.stopPropagation();
    if (this._isDisabled()) return;
    this._typedText.set(null);
    this._setValue(null);
    this._refocusField();
  }

  // --- Panel navigation ---

  protected _prev(): void {
    const view = this._view();
    if (view === 'year') this._shiftYear(-12);
    else if (view === 'month') this._shiftYear(-1);
    else this._shiftMonth(-1);
  }

  protected _next(): void {
    const view = this._view();
    if (view === 'year') this._shiftYear(12);
    else if (view === 'month') this._shiftYear(1);
    else this._shiftMonth(1);
  }

  protected _superPrev(): void {
    this._shiftYear(this._view() === 'year' ? -12 : -1);
  }

  protected _superNext(): void {
    this._shiftYear(this._view() === 'year' ? 12 : 1);
  }

  protected _showMonthView(): void {
    this._view.set('month');
  }

  protected _showYearView(): void {
    this._view.set('year');
  }

  protected _selectMonth(index: number): void {
    this._viewMonth.set(index);
    this._view.set('date');
  }

  protected _selectYear(cell: YearCell): void {
    if (cell.disabled) return;
    this._viewYear.set(cell.year);
    this._view.set('month');
  }

  protected _selectDay(cell: DayCell): void {
    if (cell.disabled || !cell.date) return;
    this._setValue(cell.date);
    this._activeDate.set(cell.date);
    this._close();
  }

  protected _selectToday(): void {
    const today = startOfDay(new Date());
    if (this._outOfRange(today.getTime())) return;
    this._setValue(today);
    this._activeDate.set(today);
    this._close();
  }

  protected _setMode(mode: CalendarSystem): void {
    if (this._mode() === mode || this._isDisabled()) return;
    this._mode.set(mode);
    this._typedText.set(null);
    this._view.set('date');
    this._syncView(this._value() ?? this._activeDate() ?? startOfDay(new Date()));
    this.calendarChange.emit(mode);
  }

  // --- Day-grid keyboard navigation ---

  protected _onGridKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        this._moveActive(-1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        this._moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this._moveActive(-7);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this._moveActive(7);
        break;
      case 'PageUp':
        event.preventDefault();
        this._moveActiveMonth(-1);
        break;
      case 'PageDown':
        event.preventDefault();
        this._moveActiveMonth(1);
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const active = this._activeDate();
        if (active && !this._outOfRange(active.getTime())) {
          this._setValue(active);
          this._close();
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        this._close(false);
        break;
      case 'Tab':
        this._close(false);
        break;
    }
  }

  private _moveActive(deltaDays: number): void {
    const base = this._activeDate() ?? this._value() ?? startOfDay(new Date());
    const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + deltaDays);
    this._setActive(next);
  }

  private _moveActiveMonth(delta: number): void {
    const base = this._activeDate() ?? this._value() ?? startOfDay(new Date());
    if (this._mode() === 'bs') {
      try {
        const nd = new NepaliDate(base);
        const day = Math.min(nd.getDate(), 29); // every BS month has ≥ 29 days
        const next = new NepaliDate(nd.getYear(), nd.getMonth() + delta, day);
        this._setActive(next.toJsDate());
      } catch {
        // Landed outside the BS table — stay put.
      }
      return;
    }
    const daysInTarget = new Date(base.getFullYear(), base.getMonth() + delta + 1, 0).getDate();
    this._setActive(
      new Date(base.getFullYear(), base.getMonth() + delta, Math.min(base.getDate(), daysInTarget)),
    );
  }

  private _setActive(date: Date): void {
    if (this._mode() === 'bs' && !this._toBs(date)) return;
    this._activeDate.set(date);
    this._syncView(date);
  }

  // --- Open / close / position ---

  private _openPanel(): void {
    if (this._isDisabled() || this._open()) return;
    this._todayTime.set(startOfDay(new Date()).getTime());
    this._view.set('date');
    const anchor = this._value() ?? startOfDay(new Date());
    this._activeDate.set(anchor);
    this._syncView(anchor);
    this._open.set(true);
    this._reposition();
    window.addEventListener('scroll', this._onViewportChange, true);
    window.addEventListener('resize', this._onViewportChange);
    queueMicrotask(() => this._reposition());
  }

  private _close(refocus = true): void {
    if (!this._open()) return;
    this._open.set(false);
    window.removeEventListener('scroll', this._onViewportChange, true);
    window.removeEventListener('resize', this._onViewportChange);
    if (refocus) this._refocusField();
  }

  /** Focus the field without re-triggering `openCalendarOnFocus`. */
  private _refocusField(): void {
    this._skipFocusOpen = true;
    this._field()?.nativeElement.focus();
    queueMicrotask(() => (this._skipFocusOpen = false));
  }

  private _reposition(): void {
    const el = this._trigger()?.nativeElement;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const dropUp = spaceBelow < PANEL_HEIGHT && spaceAbove > spaceBelow;

    this._dropUp.set(dropUp);
    this._panelLeft.set(Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8)));
    if (dropUp) {
      this._panelTop.set(null);
      this._panelBottom.set(window.innerHeight - rect.top + gap);
    } else {
      this._panelTop.set(rect.bottom + gap);
      this._panelBottom.set(null);
    }
  }

  // --- Value & conversion helpers ---

  private _commitTyped(): void {
    const typed = this._typedText();
    if (typed === null) return;
    this._typedText.set(null);

    const text = typed.trim();
    if (!text) {
      if (this._hasValue()) this._setValue(null);
      return;
    }

    try {
      const { year, month, date } = parseDateString(text);
      let parsed: Date | null = null;
      if (this._mode() === 'bs') {
        if (month >= 0 && month <= 11 && date >= 1 && date <= this._daysInBsMonth(year, month)) {
          parsed = this._bsToJs(year, month, date);
        }
      } else {
        const candidate = new Date(year, month, date);
        const roundTrips =
          candidate.getFullYear() === year &&
          candidate.getMonth() === month &&
          candidate.getDate() === date;
        parsed = roundTrips ? candidate : null;
      }
      if (parsed && !this._outOfRange(parsed.getTime())) {
        this._setValue(parsed);
        this._activeDate.set(parsed);
        this._syncView(parsed);
      }
    } catch {
      // Unparseable text — revert to the last committed value.
    }
  }

  private _setValue(value: Date | null): void {
    const normalized = value ? startOfDay(value) : null;
    this._value.set(normalized);
    this._onChange(normalized);
    this.change.emit(normalized);
  }

  /** Point the view at the month containing `date`, in the active calendar system. */
  private _syncView(date: Date): void {
    if (this._mode() === 'bs') {
      const bs = this._toBs(date) ?? this._toBs(new Date());
      if (bs) {
        this._viewYear.set(bs.year);
        this._viewMonth.set(bs.month);
        return;
      }
    }
    this._viewYear.set(date.getFullYear());
    this._viewMonth.set(date.getMonth());
  }

  private _shiftMonth(delta: number): void {
    let month = this._viewMonth() + delta;
    let year = this._viewYear();
    while (month < 0) {
      month += 12;
      year--;
    }
    while (month > 11) {
      month -= 12;
      year++;
    }
    const [minYear, maxYear] = this._yearBounds();
    if (year < minYear) {
      year = minYear;
      month = 0;
    } else if (year > maxYear) {
      year = maxYear;
      month = 11;
    }
    this._viewYear.set(year);
    this._viewMonth.set(month);
  }

  private _shiftYear(delta: number): void {
    const [minYear, maxYear] = this._yearBounds();
    this._viewYear.set(Math.max(minYear, Math.min(maxYear, this._viewYear() + delta)));
  }

  private _yearBounds(): [number, number] {
    return this._mode() === 'bs' ? [BS_YEAR_MIN, BS_YEAR_MAX] : [AD_YEAR_MIN, AD_YEAR_MAX];
  }

  private _yearLabel(year: number): string {
    return this._mode() === 'bs'
      ? formatBs({ year, month: 0, date: 1 }, 'YYYY', this.lang())
      : String(year);
  }

  private _toBs(date: Date): { year: number; month: number; date: number; day?: number } | null {
    try {
      return new NepaliDate(date).getBS();
    } catch {
      return null;
    }
  }

  private _bsToJs(year: number, month: number, date: number): Date | null {
    try {
      return new NepaliDate(year, month, date).toJsDate();
    } catch {
      return null;
    }
  }

  private _daysInBsMonth(year: number, month: number): number {
    const config = dateConfigMap[String(year)];
    return config ? Object.values(config)[month] : 0;
  }

  private _boundTime(bound: Date | string | null): number | null {
    if (bound == null || bound === '') return null;
    const date = bound instanceof Date ? bound : new Date(bound);
    return isNaN(date.getTime()) ? null : startOfDay(date).getTime();
  }

  private _outOfRange(time: number): boolean {
    const min = this._minTime();
    const max = this._maxTime();
    return (min !== null && time < min) || (max !== null && time > max);
  }

  // --- ControlValueAccessor ---

  writeValue(value: Date | string | null): void {
    if (value == null || value === '') {
      this._value.set(null);
      return;
    }
    const date = value instanceof Date ? value : new Date(value);
    this._value.set(isNaN(date.getTime()) ? null : startOfDay(date));
  }

  registerOnChange(fn: (value: Date | null) => void): void {
    this._onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this._onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this._disabledByForm.set(isDisabled);
  }
}
