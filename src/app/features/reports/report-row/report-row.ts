import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { SymbolIcon } from '../../../shared/components/symbol-icon/symbol-icon';

/** A thin bar under a row's name: `pct` of the track, in `color`. */
export interface ReportBar {
  pct: number;
  color: string;
}

/**
 * One line of a ranked report list (categories, payees, accounts): icon, name
 * and caption, share bars, and the amount right-aligned with its detail under
 * it. The bars only repeat what the text says, so they're hidden from screen
 * readers. Clickable rows open the entries behind them (RPT-04).
 */
@Component({
  selector: 'app-report-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, SymbolIcon],
  template: `
    <ng-template #content>
      @if (icon(); as icon) {
        <app-symbol-icon [icon]="icon" [color]="color() ?? 'var(--text-tertiary)'" [size]="36" />
      }
      <span class="report-row__text">
        <span class="report-row__name text-ellipsis">{{ name() }}</span>
        @if (caption()) {
          <span class="report-row__caption text-ellipsis">{{ caption() }}</span>
        }
        @for (bar of bars(); track $index) {
          <span class="report-row__track" aria-hidden="true">
            <span [style.width.%]="bar.pct" [style.background]="bar.color"></span>
          </span>
        }
      </span>
      <span class="report-row__end">
        <span class="report-row__value">{{ value() }}</span>
        @if (detail()) {
          <span class="report-row__detail">{{ detail() }}</span>
        }
      </span>
    </ng-template>

    @if (clickable()) {
      <button type="button" class="report-row" (click)="open.emit()">
        <ng-container [ngTemplateOutlet]="content" />
      </button>
    } @else {
      <div class="report-row"><ng-container [ngTemplateOutlet]="content" /></div>
    }
  `,
  styleUrl: './report-row.scss',
})
export class ReportRow {
  readonly name = input.required<string>();
  readonly caption = input('');
  /** The formatted amount. */
  readonly value = input.required<string>();
  /** Under the amount, such as a share of the total. */
  readonly detail = input('');
  /** Material Symbols name, drawn in `color` on its tint. */
  readonly icon = input<string | null>(null);
  readonly color = input<string | null>(null);
  readonly bars = input<readonly ReportBar[]>([]);
  readonly clickable = input(true);

  readonly open = output<void>();
}
