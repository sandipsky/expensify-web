import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BudgetProgress } from '../../../core/domain/budget';
import { Budget } from '../../../core/models/budget';
import { SymbolIcon } from '../../../shared/components/symbol-icon/symbol-icon';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { Chip } from '../../../shared/components/ui/chip';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { Menu } from '../../../shared/components/ui/menu';
import { Skeleton } from '../../../shared/components/ui/skeleton';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { BUDGET_PERIOD_LABELS, PER_PERIOD } from '../budget-labels';
import { BudgetMeter } from '../budget-meter/budget-meter';
import { BudgetsStore } from '../budgets.store';

/**
 * One budget on the Budgets page: name, what it counts, and its current period
 * (BUD-02, BUD-03), or just its limit while paused. The name links to the
 * budget's page (BUD-05) and the link covers the whole card.
 */
@Component({
  selector: 'app-budget-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    BudgetMeter,
    Button,
    Card,
    Chip,
    Icon,
    Menu,
    MoneyPipe,
    Skeleton,
    SymbolIcon,
  ],
  templateUrl: './budget-card.html',
  styleUrl: './budget-card.scss',
})
export class BudgetCard {
  readonly budget = input.required<Budget>();
  /** The current figures; skeletons show while they load. */
  readonly progress = input<BudgetProgress>();

  readonly edit = output<void>();
  readonly pause = output<void>();
  readonly resume = output<void>();
  readonly delete = output<void>();

  protected readonly store = inject(BudgetsStore);

  protected readonly icon = computed(() => this.store.iconOf(this.budget()));
  protected readonly caption = computed(
    () => `${BUDGET_PERIOD_LABELS[this.budget().period]} · ${this.store.scopeOf(this.budget())}`,
  );
  protected readonly perPeriod = computed(() => PER_PERIOD[this.budget().period]);
}
