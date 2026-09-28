import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SymbolIcon } from '../../../shared/components/symbol-icon/symbol-icon';
import { Chip } from '../../../shared/components/ui/chip';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { Checkbox } from '../../../shared/components/ui/input/checkbox/checkbox';
import { receipts } from '../receipts/receipt-labels';
import { TransactionAmount } from '../transaction-amount/transaction-amount';
import { TxRow } from '../transaction-rows';

/**
 * One transaction in the phone and tablet list: category icon, title, a line
 * of detail and the signed amount, exactly 64px tall for the virtual list.
 * Tapping opens it, or selects it while selecting (TXN-13).
 */
@Component({
  selector: 'app-transaction-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Checkbox, Chip, Icon, SymbolIcon, TransactionAmount],
  templateUrl: './transaction-row.html',
  styleUrl: './transaction-row.scss',
  host: { '[class.is-selected]': 'selected()' },
})
export class TransactionRow {
  readonly row = input.required<TxRow>();
  /** Show a checkbox; a tap then selects instead of opening. */
  readonly selecting = input(false);
  readonly selected = input(false);

  readonly open = output<void>();
  readonly toggle = output<void>();

  protected readonly receiptsLabel = receipts;
}
