import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  TemplateRef,
  computed,
  contentChild,
  contentChildren,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { injectVirtualWindow } from '../virtual-list/virtual-window';
import { TableCellDirective } from './table-cell.directive';
import { TableGroupDirective } from './table-group.directive';

export type SortDirection = 'asc' | 'desc';
export type TableAlign = 'left' | 'center' | 'right';

export interface TableSort {
  key: string;
  direction: SortDirection;
}

/** One rendered `<tbody>` row: a group header or a data row. */
type TableEntry =
  | { kind: 'group'; key: unknown; rows: readonly any[]; index: number }
  | { kind: 'row'; row: any; index: number };

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
 * `groupBy` puts a header row (an `<ng-template lTableGroup>`) above each run of
 * rows sharing a key, such as a date, while the table is unsorted; sorting by a
 * column shows plain rows. `virtualScroll` renders only the rows in and near
 * view, for thousands of rows: every row is then exactly `rowHeight` px tall
 * (group rows `groupRowHeight`), so keep cells to one line.
 *
 * ```html
 * <l-table [columns]="cols" [data]="rows" [(sort)]="sort" />
 * <l-table [columns]="cols" [data]="rows" [serverSort]="true"
 *          [loading]="loading()" (sortChange)="fetch($event)" />
 * <l-table [columns]="cols" [data]="rows" groupBy="date" [virtualScroll]="true" />
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
  /** Which rows show as selected, e.g. while picking rows for a bulk action. */
  readonly rowSelected = input<(row: any) => boolean>();
  /** Group consecutive rows by this property or function while unsorted; see `lTableGroup`. */
  readonly groupBy = input<string | ((row: any) => unknown)>();
  /** Render only the rows in and near view. Rows must then keep to their fixed heights. */
  readonly virtualScroll = input(false);
  /** Height of every data row in px when `virtualScroll` is on. */
  readonly rowHeight = input(44);
  /** Height of every group header row in px when `virtualScroll` is on. */
  readonly groupRowHeight = input(36);

  // Note: the `sort` model already emits a `sortChange` output on every change,
  // so consumers can bind `(sortChange)` — no separate output needed.
  readonly rowClick = output<any>();

  private readonly _cells = contentChildren(TableCellDirective);
  private readonly _cellMap = computed(
    () => new Map(this._cells().map((c) => [c.lTableCell(), c.template])),
  );
  protected readonly _group = contentChild(TableGroupDirective);
  private readonly _body = viewChild<ElementRef<HTMLElement>>('body');

  protected readonly _rows = computed(() => {
    const sort = this.sort();
    const rows = this.data();
    if (this.serverSort() || !sort) return rows;
    const { key, direction } = sort;
    const factor = direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => this._compare(a?.[key], b?.[key]) * factor);
  });

  /** Data rows, with a header before each group while grouped and unsorted. */
  private readonly _entries = computed<TableEntry[]>(() => {
    const rows = this._rows();
    const groupBy = this.groupBy();
    if (!groupBy || !this._group() || this.sort()) {
      return rows.map((row, index) => ({ kind: 'row', row, index }));
    }
    const keyOf = typeof groupBy === 'function' ? groupBy : (row: any) => row?.[groupBy];
    const entries: TableEntry[] = [];
    let header: { kind: 'group'; key: unknown; rows: any[]; index: number } | null = null;
    rows.forEach((row, index) => {
      const key = keyOf(row);
      if (!header || header.key !== key) {
        header = { kind: 'group', key, rows: [], index };
        entries.push(header);
      }
      header.rows.push(row);
      entries.push({ kind: 'row', row, index });
    });
    return entries;
  });

  private readonly _sizes = computed(() => {
    if (!this.virtualScroll()) return [];
    const row = this.rowHeight();
    const group = this.groupRowHeight();
    return this._entries().map((entry) => (entry.kind === 'group' ? group : row));
  });

  protected readonly _window = injectVirtualWindow({
    anchor: () => this._body()?.nativeElement,
    sizes: this._sizes,
  });

  /** The entries to render: all of them, or the virtual window's slice. */
  protected readonly _visibleEntries = computed(() => {
    const entries = this._entries();
    if (!this.virtualScroll()) return entries;
    const { start, end } = this._window();
    return entries.slice(start, end);
  });

  protected _trackEntry(entry: TableEntry): unknown {
    // A key may repeat in data that isn't ordered by it, so the first row's index goes along.
    if (entry.kind === 'group') return `group:${String(entry.key)}:${entry.index}`;
    return this._trackRow(entry.index, entry.row);
  }

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
