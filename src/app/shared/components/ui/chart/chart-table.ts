import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** @internal One row of a chart's table view. */
export interface ChartTableRow {
  key: string;
  /** Row header: the group or segment name. */
  name: string;
  /** Formatted values, one per column. */
  cells: readonly string[];
  current: boolean;
}

/**
 * @internal The table view of a chart: the same values as the plot, readable without
 * hovering. Value columns are right-aligned tabular numbers.
 */
@Component({
  selector: 'l-chart-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table>
      <caption class="visually-hidden">
        {{
          caption()
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col">Item</th>
          @for (column of columns(); track $index) {
            <th scope="col" class="l-chart__num">{{ column }}</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track row.key) {
          <tr [attr.aria-current]="row.current ? 'true' : null">
            <th scope="row">
              @if (clickable()) {
                <button type="button" class="l-chart__row-btn" (click)="rowClick.emit(row.key)">
                  {{ row.name }}
                </button>
              } @else {
                {{ row.name }}
              }
            </th>
            @for (cell of row.cells; track $index) {
              <td class="l-chart__num">{{ cell }}</td>
            }
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th,
    td {
      padding: 8px;
      border-bottom: 1px solid var(--separator-light);
      font-weight: 400;
      text-align: left;
    }
    thead th {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);
    }
    .l-chart__num {
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    tr[aria-current] > * {
      background: var(--accent-bg);
    }
    button {
      min-height: 24px;
      padding: 0;
      border: 0;
      background: none;
      color: var(--accent);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    button:hover {
      text-decoration: underline;
    }
    button:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
      border-radius: 2px;
    }
  `,
})
export class ChartTable {
  /** Accessible caption: the chart's label. */
  readonly caption = input.required<string>();
  /** Value column headers, after the "Item" column. */
  readonly columns = input.required<readonly string[]>();
  readonly rows = input.required<readonly ChartTableRow[]>();
  /** Make each row header a button that emits `rowClick` with the row key. */
  readonly clickable = input(false);

  readonly rowClick = output<string>();
}
