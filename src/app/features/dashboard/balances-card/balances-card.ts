import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Account } from '../../../core/models/account';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { SymbolIcon } from '../../../shared/components/symbol-icon/symbol-icon';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { AccountActions } from '../../accounts/account-actions';
import { ACCOUNT_TYPE_LABELS, balanceView } from '../../accounts/account-labels';
import { AccountsStore } from '../../accounts/accounts.store';
import { DashboardStore } from '../dashboard.store';

interface BalanceRow {
  account: Account;
  /** "Bank", "Credit card · Owed". */
  caption: string;
  amount: number;
  negative: boolean;
}

/**
 * The total of the accounts marked "include in total", then every active
 * account with its balance (DSH-02, ACC-02, ACC-04); cards and loans read as
 * the amount owed (ACC-08). The total opens Accounts and an account opens its
 * page (DSH-11).
 */
@Component({
  selector: 'app-balances-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, Card, EmptyState, SymbolIcon],
  templateUrl: './balances-card.html',
  styleUrl: './balances-card.scss',
})
export class BalancesCard {
  protected readonly store = inject(DashboardStore);
  protected readonly accounts = inject(AccountsStore);
  private readonly actions = inject(AccountActions);

  protected readonly rows = computed<BalanceRow[]>(() =>
    this.accounts.active().map((account) => {
      const view = balanceView(account);
      const type = ACCOUNT_TYPE_LABELS[account.type];
      return {
        account,
        caption: view.caption === 'Balance' ? type : `${type} · ${view.caption}`,
        amount: view.amount,
        negative: view.negative,
      };
    }),
  );

  /** "Across 3 accounts · 1 not included". */
  protected readonly note = computed(() => {
    const excluded = this.accounts.excludedCount();
    const included = this.accounts.active().length - excluded;
    const note = `Across ${included} ${included === 1 ? 'account' : 'accounts'}`;
    return excluded ? `${note} · ${excluded} not included` : note;
  });

  protected add(): void {
    this.actions.create().subscribe();
  }
}
