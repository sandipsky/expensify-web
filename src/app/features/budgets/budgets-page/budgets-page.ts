import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { Accordion, AccordionItem } from '../../../shared/components/ui/accordion';
import { Breadcrumb } from '../../../shared/components/ui/breadcrumb';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { Col, Row } from '../../../shared/components/ui/layout';
import { Skeleton } from '../../../shared/components/ui/skeleton';
import { BudgetActions } from '../budget-actions';
import { BudgetCard } from '../budget-card/budget-card';
import { BudgetsStore } from '../budgets.store';

/**
 * `/budgets`: every active budget with its current period (BUD-02, BUD-03),
 * then the paused ones. All of them read one listener on the dates they need
 * (NFR-19).
 */
@Component({
  selector: 'app-budgets-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Accordion,
    AccordionItem,
    BudgetCard,
    Breadcrumb,
    Button,
    Card,
    Col,
    EmptyState,
    Icon,
    Row,
    Skeleton,
  ],
  templateUrl: './budgets-page.html',
  styleUrl: './budgets-page.scss',
})
export class BudgetsPage {
  protected readonly store = inject(BudgetsStore);
  protected readonly actions = inject(BudgetActions);

  protected add(): void {
    this.actions.create().subscribe();
  }
}
