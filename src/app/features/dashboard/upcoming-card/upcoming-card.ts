import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SymbolIcon } from '../../../shared/components/symbol-icon/symbol-icon';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { RecurringActions } from '../../recurring/recurring-actions';
import { TransactionAmount } from '../../transactions/transaction-amount/transaction-amount';
import { DashboardStore } from '../dashboard.store';

/**
 * Recurring occurrences due now or in the next seven days (DSH-08): name,
 * date and amount, with Confirm and Skip on a due ask-first entry (REC-04).
 * A row opens the rule. The page hides the card while there's nothing to show.
 */
@Component({
  selector: 'app-upcoming-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, Card, Icon, SymbolIcon, TransactionAmount],
  templateUrl: './upcoming-card.html',
  styleUrl: './upcoming-card.scss',
})
export class UpcomingCard {
  protected readonly store = inject(DashboardStore);
  protected readonly actions = inject(RecurringActions);
}
