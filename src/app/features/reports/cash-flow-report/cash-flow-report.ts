import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { accountFlows } from '../../../core/domain/reports';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { TransactionActions } from '../../transactions/transaction-actions';
import { ReportRow } from '../report-row/report-row';
import { ReportsStore } from '../reports.store';

/**
 * Money in and out of each account in the period (RPT-06): income and
 * transfers in against expenses and transfers out, and the net. Transfers
 * count here, since they do move money between accounts; balance adjustments
 * don't (BR-12). An account opens its entries for the period (RPT-04).
 */
@Component({
  selector: 'app-cash-flow-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Card, EmptyState, ReportRow],
  template: `
    @if (!rows().length) {
      <l-card>
        <app-empty-state
          icon="swap_horiz"
          title="No money moved in this period"
          message="Pick another period, or add an entry."
        >
          <l-button size="lg" (click)="add()">Add transaction</l-button>
        </app-empty-state>
      </l-card>
    } @else {
      <l-card title="Money in and out by account" [flush]="true">
        <div class="cash-flow__legend" aria-hidden="true">
          <span><i class="cash-flow__key cash-flow__key--in"></i>In</span>
          <span><i class="cash-flow__key cash-flow__key--out"></i>Out</span>
        </div>
        <ul class="cash-flow" aria-label="Money in and out by account">
          @for (row of rows(); track row.accountId) {
            <li>
              <app-report-row
                [icon]="row.icon"
                [color]="row.color"
                [name]="row.name"
                [caption]="row.caption"
                [value]="store.signedMoney(row.net)"
                detail="net"
                [bars]="row.bars"
                (open)="open(row.accountId)"
              />
            </li>
          }
        </ul>
        <p card-footer class="cash-flow__note">
          A transfer counts as money out of one account and into the other. Balance adjustments are
          left out.
        </p>
      </l-card>
    }
  `,
  styles: `
    .cash-flow {
      list-style: none;

      li + li {
        border-top: 1px solid var(--separator-light);
      }
    }

    .cash-flow__legend {
      display: flex;
      gap: 16px;
      padding: 12px 16px 4px;
      color: var(--text-secondary);
      font-size: 12px;
    }

    .cash-flow__key {
      display: inline-block;
      width: 10px;
      height: 10px;
      margin-right: 6px;
      border-radius: 2px;
      vertical-align: -1px;
    }

    .cash-flow__key--in {
      background: var(--success);
    }

    .cash-flow__key--out {
      background: var(--error);
    }

    .cash-flow__note {
      color: var(--text-tertiary);
      font-size: 12px;
      line-height: 16px;
    }
  `,
})
export class CashFlowReport {
  protected readonly store = inject(ReportsStore);
  private readonly transactions = inject(TransactionActions);

  protected readonly rows = computed(() => {
    const flows = accountFlows(this.store.txs());
    const max = Math.max(1, ...flows.flatMap((f) => [f.moneyIn, f.moneyOut]));
    const money = this.store.money;
    return flows.map((f) => {
      const parts = [
        `In ${money(f.moneyIn)}`,
        f.transfersIn ? `(${money(f.transfersIn)} transfers)` : '',
        `· Out ${money(f.moneyOut)}`,
        f.transfersOut ? `(${money(f.transfersOut)} transfers)` : '',
      ];
      return {
        ...f,
        ...this.store.accountView(f.accountId),
        caption: parts.filter(Boolean).join(' '),
        bars: [
          { pct: (f.moneyIn / max) * 100, color: 'var(--success)' },
          { pct: (f.moneyOut / max) * 100, color: 'var(--error)' },
        ],
      };
    });
  });

  protected open(accountId: string): void {
    this.store.drillDown({ range: this.store.range(), accountId });
  }

  protected add(): void {
    this.transactions.create().subscribe();
  }
}
