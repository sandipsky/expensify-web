import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon, IconName } from '../ui/icon/icon';

/**
 * What a list or card shows when it has nothing yet. Every empty state offers
 * the next action, so project a button into it.
 *
 * ```html
 * <app-empty-state icon="account_balance_wallet" title="No accounts yet" message="…">
 *   <l-button (click)="add()">Add account</l-button>
 * </app-empty-state>
 * ```
 */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <span class="empty-state__icon"
      ><l-icon [name]="icon()" [size]="28" color="var(--accent)"
    /></span>
    <p class="empty-state__title">{{ title() }}</p>
    @if (message()) {
      <p class="empty-state__message">{{ message() }}</p>
    }
    <div class="empty-state__actions"><ng-content /></div>
  `,
  styleUrl: './empty-state.scss',
})
export class EmptyState {
  readonly icon = input.required<IconName>();
  readonly title = input.required<string>();
  readonly message = input('');
}
