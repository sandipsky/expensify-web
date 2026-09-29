import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TxType } from '../../../core/models/transaction';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { TX_TYPE_LABELS } from '../transaction-labels';
import { TxRow } from '../transaction-rows';

/** What every amount reads as in privacy mode (DSH-09). */
export const MASKED_AMOUNT = '••••';

/**
 * A transaction's amount as lists show it: signed, in the income or expense
 * color, and with a direction icon and a spoken type, so it never relies on
 * color alone (NFR-09). Transfers read unsigned and neutral.
 */
@Component({
  selector: 'app-tx-amount',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, MoneyPipe],
  template: `
    <l-icon [name]="_icon()" [size]="14" color="inherit" />
    <span class="visually-hidden">{{ _label() }}</span>
    @if (masked()) {
      <span aria-label="Amount hidden">{{ MASK }}</span>
    } @else {
      {{ _amount() | money: _currency() : (_kind() === 'transfer' ? 'auto' : 'exceptZero') }}
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      gap: 4px;
      color: var(--text-primary);
      font-weight: 500;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    :host(.is-income) {
      color: var(--success);
    }

    :host(.is-expense) {
      color: var(--error);
    }
  `,
  host: {
    '[class.is-income]': "_kind() === 'income'",
    '[class.is-expense]': "_kind() === 'expense'",
  },
})
export class TransactionAmount {
  /** A list row; or pass `kind`, `amount` and `currency` instead, as a recurring rule does. */
  readonly row = input<TxRow>();
  readonly kind = input<TxType>('expense');
  /** Signed as `TxRow.amount` is: − for an expense, in minor units. */
  readonly amount = input(0);
  readonly currency = input('');
  /** Privacy mode (DSH-09): show dots instead of the amount. */
  readonly masked = input(false);

  protected readonly MASK = MASKED_AMOUNT;
  protected readonly _kind = computed(() => this.row()?.kind ?? this.kind());
  protected readonly _amount = computed(() => this.row()?.amount ?? this.amount());
  protected readonly _currency = computed(() => this.row()?.tx.currency ?? this.currency());
  protected readonly _label = computed(() => TX_TYPE_LABELS[this._kind()]);
  protected readonly _icon = computed(() => {
    const kind = this._kind();
    return kind === 'transfer' ? 'swap_horiz' : kind === 'income' ? 'south_west' : 'north_east';
  });
}
