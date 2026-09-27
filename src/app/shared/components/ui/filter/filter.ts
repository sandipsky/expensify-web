import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Menu } from '../menu/menu';
import { Button } from '../button/button';
import { Select } from '../input/select/select';
import { TextInput } from '../input/text-input/text-input';

/** A single configurable filter field. */
export interface FilterColumn {
  /** Field label shown above the control and in the active-filter chip. */
  name: string;
  /** The field key reported back in {@link FilterChange.field}. */
  formcontrolName: string;
  type: 'text' | 'select';
  /** Current value; bound two-way to the field control. */
  value?: string | number | null;
  /** Options for `select` fields (id ↔ value, name ↔ label); may carry extra keys for `groupBy`. */
  data?: readonly ({ id: string | number; name: string } & Record<string, unknown>)[];
  /** Optional `select` grouping key (a property on each option). */
  groupBy?: string;
}

/** One entry of the emitted, applied filter set. */
export interface FilterChange {
  field: string;
  value: string;
  displayValue: string;
}

/** Internal representation of an applied filter (column or free-text search). */
interface ActiveFilter {
  filterName?: string;
  formcontrolName: string;
  displayValue: string;
  value: string | number | null | undefined;
  type?: 'search';
}

/**
 * Toolbar that combines a free-text search box with a dropdown of configurable
 * field filters (text / single-select). Applied filters surface as removable
 * chips, and the whole set is emitted via `filterChange`.
 *
 * ```html
 * <l-filter
 *   searchBy="name"
 *   [filterColumns]="columns"
 *   (filterChange)="onFilters($event)"
 * />
 * ```
 */
@Component({
  selector: 'l-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Menu, Button, Select, TextInput],
  templateUrl: './filter.html',
  styleUrl: './filter.scss',
})
export class Filter {
  /** Fields rendered inside the filter dropdown. */
  readonly filterColumns = input<FilterColumn[]>([]);
  /** Field key for the free-text search box; empty hides the search box. */
  readonly searchBy = input<string>('');

  /** Emits the full set of applied filters whenever it changes. */
  readonly filterChange = output<FilterChange[]>();

  private readonly _filterDropdown = viewChild<Menu>('filterDropdown');

  protected readonly _filterList = signal<ActiveFilter[]>([]);
  protected readonly _searchText = signal<string>('');

  protected _applyFilter(): void {
    const applied: ActiveFilter[] = [];

    for (const filter of this.filterColumns()) {
      if (!filter.value) continue;
      applied.push({
        filterName: filter.name,
        formcontrolName: filter.formcontrolName,
        displayValue:
          filter.type === 'select'
            ? // `==` on purpose: option ids may be numbers while the bound value is a string.
              (filter.data?.find((item) => item.id == filter.value)?.name ?? '')
            : String(filter.value),
        value: filter.value,
      });
    }

    // Keep any active free-text search alongside the rebuilt column filters.
    const search = this._filterList().find((f) => f.type === 'search');
    this._filterList.set(search ? [...applied, search] : applied);

    this._closeDropdown();
    this._emitFilterList();
  }

  protected _onSearch(): void {
    const text = this._searchText();
    this._filterList.update((list) => {
      const withoutSearch = list.filter((f) => f.type !== 'search');
      return text
        ? [
            ...withoutSearch,
            { formcontrolName: this.searchBy(), displayValue: text, value: text, type: 'search' },
          ]
        : withoutSearch;
    });
    this._emitFilterList();
  }

  protected _removeFilter(filter: ActiveFilter): void {
    this._filterList.update((list) => list.filter((item) => item !== filter));
    const column = this.filterColumns().find((c) => c.name === filter.filterName);
    if (column) column.value = null;
    this._emitFilterList();
  }

  protected _removeAllFilter(): void {
    this._filterList.set([]);
    this.filterColumns().forEach((item) => (item.value = null));
    this._searchText.set('');
    this._emitFilterList();
  }

  protected _closeDropdown(): void {
    this._filterDropdown()?.close();
  }

  private _emitFilterList(): void {
    const mapped = this._filterList().map((f) => ({
      field: f.formcontrolName,
      value: f.value != null ? String(f.value) : '',
      displayValue: f.displayValue,
    }));
    this.filterChange.emit(mapped);
  }
}
