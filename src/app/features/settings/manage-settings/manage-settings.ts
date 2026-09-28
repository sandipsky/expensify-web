import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Card } from '../../../shared/components/ui/card/card';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { AccountsStore } from '../../accounts/accounts.store';
import { BudgetsStore } from '../../budgets/budgets.store';
import { CategoriesStore } from '../../categories/categories.store';
import { RecurringStore } from '../../recurring/recurring.store';

interface ManageLink {
  path: string;
  icon: string;
  label: string;
  /** "3 accounts", or what the page is for while there are none. */
  summary: string;
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Settings › Manage (SET-03): the accounts, categories, budgets and recurring
 * rules, one tap away, each with how many there are.
 */
@Component({
  selector: 'app-manage-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Card, Icon],
  templateUrl: './manage-settings.html',
  styleUrl: './manage-settings.scss',
})
export class ManageSettings {
  private readonly accounts = inject(AccountsStore);
  private readonly categories = inject(CategoriesStore);
  private readonly budgets = inject(BudgetsStore);
  private readonly rules = inject(RecurringStore);

  protected readonly links = computed<ManageLink[]>(() => {
    const accounts = this.accounts.active().length;
    const categories = this.categories.all().filter((c) => !c.archived && !c.isSystem).length;
    const budgets = this.budgets.all().length;
    const rules = this.rules.active().length + this.rules.paused().length;
    return [
      {
        path: '/accounts',
        icon: 'account_balance_wallet',
        label: 'Accounts',
        summary: accounts ? count(accounts, 'account') : 'Cash, bank, cards and wallets',
      },
      {
        path: '/categories',
        icon: 'category',
        label: 'Categories',
        summary: categories
          ? count(categories, 'category', 'categories')
          : 'Group income and spending',
      },
      {
        path: '/budgets',
        icon: 'donut_large',
        label: 'Budgets',
        summary: budgets ? count(budgets, 'budget') : 'Limits per week, month or year',
      },
      {
        path: '/recurring',
        icon: 'event_repeat',
        label: 'Recurring rules',
        summary: rules ? count(rules, 'rule') : 'Salary, rent and other repeats',
      },
    ];
  });
}
