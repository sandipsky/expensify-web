import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BudgetProgress } from '../../../core/domain/budget';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { SymbolIcon } from '../../../shared/components/symbol-icon/symbol-icon';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { Chip } from '../../../shared/components/ui/chip';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { Progress } from '../../../shared/components/ui/progress';
import { Skeleton } from '../../../shared/components/ui/skeleton';
import { BudgetActions } from '../../budgets/budget-actions';
import { BUDGET_STATES, StateView, percentLabel } from '../../budgets/budget-labels';
import { BudgetsStore } from '../../budgets/budgets.store';
import { DashboardStore } from '../dashboard.store';

/**
 * Up to five active budgets, most used first (DSH-07): spent of limit, a bar,
 * the state with its icon (BR-08) and safe-to-spend per day (BUD-02). A budget
 * opens its page (DSH-11); "See all" opens Budgets when there are more.
 */
@Component({
  selector: 'app-budgets-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, Card, Chip, EmptyState, Icon, Progress, Skeleton, SymbolIcon],
  templateUrl: './budgets-card.html',
  styleUrl: './budgets-card.scss',
})
export class BudgetsCard {
  protected readonly store = inject(DashboardStore);
  protected readonly budgets = inject(BudgetsStore);
  private readonly actions = inject(BudgetActions);

  protected readonly percentLabel = percentLabel;

  protected state(progress: BudgetProgress): StateView {
    return BUDGET_STATES[progress.state];
  }

  /** Remaining ÷ days left (BUD-02). */
  protected perDay(progress: BudgetProgress): string {
    const { safePerDay, daysLeft } = progress;
    if (safePerDay <= 0) return 'Nothing left to spend';
    const amount = this.store.money(safePerDay);
    return daysLeft === 1 ? `${amount} to spend today` : `${amount} a day to spend`;
  }

  protected add(): void {
    this.actions.create().subscribe();
  }
}
