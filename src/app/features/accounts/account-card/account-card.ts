import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Account } from '../../../core/models/account';
import { SymbolIcon } from '../../../shared/components/symbol-icon/symbol-icon';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { Chip } from '../../../shared/components/ui/chip';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { Menu } from '../../../shared/components/ui/menu';
import { Progress } from '../../../shared/components/ui/progress';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { ACCOUNT_TYPE_LABELS, balanceView, utilizationView } from '../account-labels';

/**
 * One account on the Accounts page: icon, name, type and balance (ACC-02), the
 * amount owed and credit use for cards and loans (ACC-08), and a menu with the
 * account's actions. The name links to the account page (ACC-06) and the link
 * covers the whole card.
 */
@Component({
  selector: 'app-account-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SymbolIcon, Button, Card, Chip, Icon, Menu, Progress, MoneyPipe],
  templateUrl: './account-card.html',
  styleUrl: './account-card.scss',
})
export class AccountCard {
  readonly account = input.required<Account>();

  readonly edit = output<void>();
  readonly reconcile = output<void>();
  readonly archive = output<void>();
  readonly restore = output<void>();
  readonly delete = output<void>();

  protected readonly typeLabel = computed(() => ACCOUNT_TYPE_LABELS[this.account().type]);
  protected readonly balance = computed(() => balanceView(this.account()));
  protected readonly utilization = computed(() => utilizationView(this.account()));
}
