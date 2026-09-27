import { Directive, TemplateRef, inject } from '@angular/core';

/** Template context of a group header row: the group's key and its rows. */
export interface TableGroupContext {
  $implicit: unknown;
  rows: readonly unknown[];
}

/**
 * Marks the `<ng-template>` that renders the header row of each group when the
 * table has `groupBy`. It spans every column.
 *
 * ```html
 * <l-table [columns]="cols" [data]="rows" groupBy="date">
 *   <ng-template lTableGroup let-date let-rows="rows">{{ date }} ({{ rows.length }})</ng-template>
 * </l-table>
 * ```
 */
@Directive({
  selector: 'ng-template[lTableGroup]',
})
export class TableGroupDirective {
  readonly template = inject<TemplateRef<TableGroupContext>>(TemplateRef);
}
