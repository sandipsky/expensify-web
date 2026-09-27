import { Directive, TemplateRef, inject, input } from '@angular/core';

/**
 * Marks an `<ng-template>` as the custom cell renderer for a column. Bind the
 * column `key`; the template context exposes the row (`$implicit`), the cell
 * `value`, the `column`, and the row `index`.
 *
 * ```html
 * <l-table [columns]="cols" [data]="rows">
 *   <ng-template lTableCell="status" let-row let-value="value">
 *     <span class="status" [class]="value">…</span>
 *   </ng-template>
 * </l-table>
 * ```
 */
@Directive({
  selector: 'ng-template[lTableCell]',
})
export class TableCellDirective {
  /** The column `key` this template renders. */
  readonly lTableCell = input.required<string>();
  readonly template = inject(TemplateRef);
}
