import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { TransactionActions } from '../../transactions/transaction-actions';
import { TransactionRow } from '../../transactions/transaction-row/transaction-row';
import { TxRow } from '../../transactions/transaction-rows';
import { DashboardStore } from '../dashboard.store';

/** The period's three largest expenses (DSH-15), each opening its form. Off until the user turns the card on (DSH-16). */
@Component({
  selector: 'app-largest-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Card, EmptyState, TransactionRow],
  template: `
    <l-card title="Largest expenses" [flush]="true">
      @if (!store.largest().length) {
        <app-empty-state
          icon="north_east"
          title="No expenses this period"
          message="The biggest ones show up here."
        >
          <l-button size="lg" (click)="add()">Add expense</l-button>
        </app-empty-state>
      } @else {
        <ul class="largest" aria-label="Largest expenses">
          @for (row of store.largest(); track row.id) {
            <li>
              <app-transaction-row [row]="row" [masked]="store.masked()" (open)="open(row)" />
            </li>
          }
        </ul>
      }
    </l-card>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }

    l-card {
      height: 100%;
    }

    .largest {
      list-style: none;

      li:last-child app-transaction-row {
        border-bottom: 0;
      }
    }
  `,
})
export class LargestCard {
  protected readonly store = inject(DashboardStore);
  private readonly transactions = inject(TransactionActions);

  protected open(row: TxRow): void {
    this.transactions.edit(row.tx).subscribe();
  }

  protected add(): void {
    this.transactions.create({ type: 'expense' }).subscribe();
  }
}
