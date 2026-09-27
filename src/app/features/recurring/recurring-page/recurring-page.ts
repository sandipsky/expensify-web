import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { SymbolIcon } from '../../../shared/components/symbol-icon/symbol-icon';
import { Accordion, AccordionItem } from '../../../shared/components/ui/accordion';
import { Breadcrumb } from '../../../shared/components/ui/breadcrumb';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { Skeleton } from '../../../shared/components/ui/skeleton';
import { TransactionAmount } from '../../transactions/transaction-amount/transaction-amount';
import { TransactionRows } from '../../transactions/transaction-rows';
import { RecurringActions } from '../recurring-actions';
import { entryCount } from '../recurring-labels';
import { RecurringStore, RuleView } from '../recurring.store';
import { RuleRow } from '../rule-row/rule-row';

/**
 * `/recurring` (§13): ask-first entries waiting for Confirm, Skip or Edit
 * (REC-04), then the running rules with their next date, then paused and
 * ended ones (REC-07). Automatic rules add their entries on their own
 * (`RecurringRunner`).
 */
@Component({
  selector: 'app-recurring-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Accordion,
    AccordionItem,
    Breadcrumb,
    Button,
    Card,
    EmptyState,
    Icon,
    RuleRow,
    Skeleton,
    SymbolIcon,
    TransactionAmount,
  ],
  templateUrl: './recurring-page.html',
  styleUrl: './recurring-page.scss',
})
export class RecurringPage {
  protected readonly store = inject(RecurringStore);
  protected readonly actions = inject(RecurringActions);
  private readonly rows = inject(TransactionRows);

  protected add(): void {
    this.actions.create().subscribe();
  }

  /** "Due Thu, 1 Oct 2026 · Bank", with how many more wait after it. */
  protected dueCaption(view: RuleView): string {
    const more = view.due.length - 1;
    const due = `Due ${this.rows.dateLabel(view.due[0])} · ${view.accountLabel}`;
    return more ? `${due} · then ${entryCount(more)} more` : due;
  }
}
