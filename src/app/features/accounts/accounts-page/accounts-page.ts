import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { Accordion, AccordionItem } from '../../../shared/components/ui/accordion';
import { Breadcrumb } from '../../../shared/components/ui/breadcrumb';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { Col, Row } from '../../../shared/components/ui/layout';
import { Skeleton } from '../../../shared/components/ui/skeleton';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { AccountActions } from '../account-actions';
import { AccountCard } from '../account-card/account-card';
import { AccountsStore } from '../accounts.store';

/** `/accounts`: the total of included accounts, each account's balance, and archived ones (ACC-02, ACC-04). */
@Component({
  selector: 'app-accounts-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Accordion,
    AccordionItem,
    AccountCard,
    Breadcrumb,
    Button,
    Card,
    Col,
    EmptyState,
    Icon,
    MoneyPipe,
    Row,
    Skeleton,
  ],
  templateUrl: './accounts-page.html',
  styleUrl: './accounts-page.scss',
})
export class AccountsPage {
  protected readonly store = inject(AccountsStore);
  protected readonly actions = inject(AccountActions);

  protected readonly totalNote = computed(() => {
    const excluded = this.store.excludedCount();
    const included = this.store.active().length - excluded;
    const note = `Across ${included} ${included === 1 ? 'account' : 'accounts'}`;
    return excluded ? `${note} · ${excluded} not included` : note;
  });

  protected add(): void {
    this.actions.create().subscribe();
  }
}
