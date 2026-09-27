import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { largestExpenses, shareOf, topPayees } from '../../../core/domain/reports';
import { totalsOf } from '../../../core/domain/transactions';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { TransactionActions } from '../../transactions/transaction-actions';
import { TransactionRow } from '../../transactions/transaction-row/transaction-row';
import { TransactionRows, TxRow, withDate } from '../../transactions/transaction-rows';
import { ReportRow } from '../report-row/report-row';
import { entries, percentText } from '../report-labels';
import { ReportsStore } from '../reports.store';

/** How many payees and expenses each list shows. */
const TOP = 10;

/**
 * Where the period's money went by payee, and its largest single expenses
 * (RPT-07). A payee opens its expenses in the period (RPT-04); an expense
 * opens its form.
 */
@Component({
  selector: 'app-payees-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Card, EmptyState, ReportRow, TransactionRow],
  template: `
    @if (!largest().length) {
      <l-card>
        <app-empty-state
          icon="storefront"
          title="No expenses in this period"
          message="Pick another period, or add an expense with its payee."
        >
          <l-button size="lg" (click)="add()">Add expense</l-button>
        </app-empty-state>
      </l-card>
    } @else {
      <l-card title="Top payees" [flush]="true">
        @if (payees().length) {
          <ul class="payees" aria-label="Top payees">
            @for (row of payees(); track row.payee) {
              <li>
                <app-report-row
                  [name]="row.payee"
                  [caption]="entries(row.count)"
                  [value]="store.money(row.amount)"
                  [detail]="percent(row.share)"
                  [bars]="row.bars"
                  (open)="openPayee(row.payee)"
                />
              </li>
            }
          </ul>
        } @else {
          <p class="payees__none">
            None of this period's expenses has a payee. Add one under "Payee, time, tags and note"
            when you log an expense.
          </p>
        }
      </l-card>

      <l-card title="Largest expenses" [flush]="true">
        <ul class="payees" aria-label="Largest expenses">
          @for (row of largest(); track row.id) {
            <li><app-transaction-row [row]="row" (open)="openTransaction(row)" /></li>
          }
        </ul>
      </l-card>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .payees {
      list-style: none;

      li + li {
        border-top: 1px solid var(--separator-light);
      }

      li:last-child app-transaction-row {
        border-bottom: 0;
      }
    }

    .payees__none {
      padding: 16px;
      color: var(--text-tertiary);
    }
  `,
})
export class PayeesReport {
  protected readonly store = inject(ReportsStore);
  private readonly transactions = inject(TransactionActions);
  private readonly txRows = inject(TransactionRows);

  protected readonly percent = percentText;
  protected readonly entries = entries;

  private readonly spent = computed(() => totalsOf(this.store.txs()).expense);
  protected readonly payees = computed(() => {
    const payees = topPayees(this.store.txs(), TOP);
    const max = payees[0]?.amount ?? 0;
    return payees.map((p) => ({
      ...p,
      share: shareOf(p.amount, this.spent()),
      bars: [{ pct: max ? (p.amount / max) * 100 : 0, color: 'var(--accent)' }],
    }));
  });

  protected readonly largest = computed<TxRow[]>(() => {
    const today = this.store.today();
    // Largest first, not by date, so each row says when it was.
    return largestExpenses(this.store.txs(), TOP).map((tx) =>
      withDate(this.txRows.toRow(tx, today)),
    );
  });

  protected openPayee(payee: string): void {
    this.store.drillDown({ range: this.store.range(), type: 'expense', search: payee });
  }

  protected openTransaction(row: TxRow): void {
    this.transactions.edit(row.tx).subscribe();
  }

  protected add(): void {
    this.transactions.create({ type: 'expense' }).subscribe();
  }
}
