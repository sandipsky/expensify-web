import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { parseISO } from 'date-fns';
import { Preferences } from '../../../core/preferences';
import { SymbolIcon } from '../../../shared/components/symbol-icon/symbol-icon';
import { Button } from '../../../shared/components/ui/button/button';
import { Chip } from '../../../shared/components/ui/chip';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { Menu } from '../../../shared/components/ui/menu';
import { TransactionAmount } from '../../transactions/transaction-amount/transaction-amount';
import { RuleView } from '../recurring.store';

/**
 * One rule on the Recurring page: what it adds, how often, from which
 * account, its amount and next date, and a menu with its actions. The name
 * links to the rule's page, and the link covers the row.
 */
@Component({
  selector: 'app-rule-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, Chip, Icon, Menu, SymbolIcon, TransactionAmount],
  templateUrl: './rule-row.html',
  styleUrl: './rule-row.scss',
})
export class RuleRow {
  readonly view = input.required<RuleView>();
  readonly currency = input.required<string>();

  readonly edit = output<void>();
  readonly pause = output<void>();
  readonly resume = output<void>();
  readonly delete = output<void>();

  private readonly locale = inject(Preferences).locale;

  /** "Next 1 Oct", "Due", "Paused", "Ended". */
  protected readonly nextLabel = computed(() => {
    const view = this.view();
    if (view.status === 'paused') return 'Paused';
    if (!view.next) return 'Ended';
    if (view.due.length) return 'Due';
    const date = parseISO(view.next);
    const sameYear = date.getFullYear() === new Date().getFullYear();
    const text = new Intl.DateTimeFormat(this.locale(), {
      day: 'numeric',
      month: 'short',
      year: sameYear ? undefined : 'numeric',
    }).format(date);
    return `Next ${text}`;
  });
}
