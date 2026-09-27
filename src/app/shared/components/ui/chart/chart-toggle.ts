import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
  model,
} from '@angular/core';
import { Button } from '../button/button';
import { Icon } from '../icon/icon';

/**
 * @internal The "Table" toggle in a chart's top row. A toggle button keeps one label and
 * reports its state through `aria-pressed` (WAI-ARIA button pattern), so it reads
 * "Table, toggle button, pressed" while the table is shown.
 */
@Component({
  selector: 'l-chart-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Icon],
  template: `
    <l-button variant="ghost" size="sm" [class.is-on]="pressed()" (click)="pressed.set(!pressed())">
      <l-icon name="table_rows" [size]="16" color="inherit" />
      Table
    </l-button>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    /* .btn.btn-ghost outranks l-button's own .btn-ghost, which loads after these styles. */
    :host ::ng-deep .btn.btn-ghost {
      color: var(--text-secondary);
      font-weight: 500;
    }
    .is-on ::ng-deep .btn.btn-ghost {
      background: var(--bg-dark);
      color: var(--text-primary);
    }
  `,
})
export class ChartToggle {
  readonly pressed = model(false);

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    // l-button owns its native <button> and has no ARIA passthrough, so set the state on it.
    afterRenderEffect(() => {
      host.nativeElement
        .querySelector('button')
        ?.setAttribute('aria-pressed', String(this.pressed()));
    });
  }
}
