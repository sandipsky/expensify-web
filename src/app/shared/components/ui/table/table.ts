import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  computed,
  contentChildren,
  input,
  model,
  output,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TableCellDirective } from './table-cell.directive';

export type SortDirection = 'asc' | 'desc';
export type TableAlign = 'left' | 'center' | 'right';

export interface TableSort {
  key: string;
  direction: SortDirection;
}

export interface TableColumn {
  /** Property read from each row (also the sort key). */
  key: string;
  header: string;
  sortable?: boolean;
  align?: TableAlign;
  /** Any CSS width, e.g. `120px` or `20%`. */
  width?: string;
}

/**
 * Data table with column sorting, styled to match the app's `_table.scss`.
 * Feed it `columns` + `data`; cells render `row[column.key]` by default, or a
 * custom `<ng-template lTableCell="key">` when provided.
 *
 * Sorting works two ways, chosen by `serverSort`:
 * - **local** (default) — clicking a sortable header sorts `data` in place.
 * - **server** (`[serverSort]="true"`) — the table only cycles the header state
 *   and emits `(sortChange)`; you refetch and pass the sorted `data` back.
 *
 * Either way `sort` is a two-way `model`, so you can seed or read it. Header
 * clicks cycle ascending → descending → unsorted.
 *
 * ```html
 * <l-table [columns]="cols" [data]="rows" [(sort)]="sort" />
 * <l-table [columns]="cols" [data]="rows" [serverSort]="true"
 *          [loading]="loading()" (sortChange)="fetch($event)" />
 * ```
 */
@Component({
  selector: 'l-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  templateUrl: './table.html',
  styleUrl: './table.scss',
  host: {
    class: 'l-table-host',
  },
})
export class Table {
  readonly columns = input<readonly TableColumn[]>([]);
  readonly data = input<readonly any[]>([]);
  /** Let the server sort: cycle the header + emit only, never reorder locally. */
  readonly serverSort = input(false);
  readonly sort = model<TableSort | null>(null);
  readonly loading = input(false);
  readonly emptyText = input('No data to display');
  /** Row identity for tracking: a property name or a function. Defaults to index. */
  readonly rowKey = input<string | ((row: any) => unknown)>();

  // Note: the `sort` model already emits a `sortChange` output on every change,
  // so consumers can bind `(sortChange)` — no separate output needed.
  readonly rowClick = output<any>();

  private readonly _cells = contentChildren(TableCellDirective);
  private readonly _cellMap = computed(
    () => new Map(this._cells().map((c) => [c.lTableCell(), c.template])),
  );

  protected readonly _rows = computed(() => {
    const sort = this.sort();
    const rows = this.data();
    if (this.serverSort() || !sort) return rows;
    const { key, direction } = sort;
    const factor = direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => this._compare(a?.[key], b?.[key]) * factor);
  });

  protected _cellTemplate(key: string): TemplateRef<unknown> | undefined {
    return this._cellMap().get(key);
  }

  protected _value(row: any, key: string): unknown {
    return row?.[key];
  }

  protected _sortClass(column: TableColumn): 'asc' | 'desc' | 'none' {
    const sort = this.sort();
    return sort && sort.key === column.key ? sort.direction : 'none';
  }

  protected _ariaSort(column: TableColumn): 'ascending' | 'descending' | 'none' | null {
    if (!column.sortable) return null;
    const sort = this.sort();
    if (!sort || sort.key !== column.key) return 'none';
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  protected _toggleSort(column: TableColumn): void {
    if (!column.sortable) return;
    const current = this.sort();
    let next: TableSort | null;
    if (!current || current.key !== column.key) {
      next = { key: column.key, direction: 'asc' };
    } else if (current.direction === 'asc') {
      next = { key: column.key, direction: 'desc' };
    } else {
      next = null; // desc → unsorted
    }
    this.sort.set(next); // emits `sortChange` for consumers
  }

  protected _onHeaderKeydown(event: KeyboardEvent, column: TableColumn): void {
    if (!column.sortable) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this._toggleSort(column);
    }
  }

  protected readonly _trackRow = (index: number, row: any): unknown => {
    const key = this.rowKey();
    if (typeof key === 'function') return key(row);
    if (typeof key === 'string') return row?.[key];
    return index;
  };

  private _compare(a: unknown, b: unknown): number {
    if (a === b) return 0;
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  }
}
