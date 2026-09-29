import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { TransactionActions } from '../../transactions/transaction-actions';
import { TransactionRow } from '../../transactions/transaction-row/transaction-row';
import { TxRow } from '../../transactions/transaction-rows';
import { DashboardStore } from '../dashboard.store';

/**
 * The period's five newest entries by date, time and creation (DSH-05), with
 * the unsynced marker (SYN-04) and "Upcoming" for future dates (TXN-14). A row
 * opens the entry's form and "See all" the list on the period (DSH-11).
 */
@Component({
  selector: 'app-recent-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Card, EmptyState, TransactionRow],
  template: `
    <l-card title="Recent transactions" [flush]="true">
      @if (store.recent().length) {
        <button card-extra type="button" class="dash-link" (click)="seeAll()">See all</button>
      }

      @if (!store.recent().length) {
        <app-empty-state
          icon="receipt_long"
          title="Nothing logged this period"
          message="Add an entry and it shows up here."
        >
          <l-button size="lg" (click)="add()">Add your first expense</l-button>
        </app-empty-state>
      } @else {
        <ul class="recent" aria-label="Recent transactions">
          @for (row of store.recent(); track row.id) {
            <li>
              <app-transaction-row [row]="row" [masked]="store.masked()" (open)="open(row)" />
            </li>
          }
        </ul>
      }
    </l-card>
  `,
  styleUrl: './recent-card.scss',
})
export class RecentCard {
  protected readonly store = inject(DashboardStore);
  private readonly transactions = inject(TransactionActions);

  protected open(row: TxRow): void {
    this.transactions.edit(row.tx).subscribe();
  }

  protected seeAll(): void {
    this.store.drillDown({ range: this.store.range() });
  }

  protected add(): void {
    this.transactions.create({ type: 'expense' }).subscribe();
  }
}
