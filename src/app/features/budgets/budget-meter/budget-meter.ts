import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { BudgetProgress } from '../../../core/domain/budget';
import { formatMoney } from '../../../core/domain/money';
import { formatPeriod } from '../../../core/domain/period';
import { BudgetPeriod } from '../../../core/models/budget';
import { Preferences } from '../../../core/preferences';
import { Chip } from '../../../shared/components/ui/chip';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { Progress } from '../../../shared/components/ui/progress';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { BUDGET_STATES, PREVIOUS_PERIOD, daysLeftLabel, percentLabel } from '../budget-labels';

/**
 * A budget's current period at a glance (BUD-02, BUD-03): spent of limit, a bar,
 * the state with its icon, what's left, and safe-to-spend per day. With
 * rollover it says what came in from the period before (BUD-07).
 */
@Component({
  selector: 'app-budget-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, Icon, MoneyPipe, Progress],
  templateUrl: './budget-meter.html',
  styleUrl: './budget-meter.scss',
})
export class BudgetMeter {
  readonly progress = input.required<BudgetProgress>();
  readonly currency = input.required<string>();
  readonly period = input.required<BudgetPeriod>();
  /** The budget's name, for the bar's accessible label. */
  readonly name = input.required<string>();

  private readonly locale = inject(Preferences).locale;

  protected readonly state = computed(() => BUDGET_STATES[this.progress().state]);
  protected readonly percent = computed(() => percentLabel(this.progress().percent));
  /** A zero limit has nothing left, so its bar reads full. */
  protected readonly bar = computed(() => this.progress().percent ?? 100);

  protected readonly periodLabel = computed(() => {
    const { range, daysLeft } = this.progress();
    return `${formatPeriod(range, this.locale())} · ${daysLeftLabel(daysLeft)}`;
  });

  protected readonly remaining = computed(() => {
    const { remaining } = this.progress();
    return remaining < 0 ? `${this.money(-remaining)} over` : `${this.money(remaining)} left`;
  });

  /** Remaining ÷ days left (BUD-02). */
  protected readonly perDay = computed(() => {
    const { safePerDay, daysLeft } = this.progress();
    if (safePerDay <= 0) return 'Nothing left to spend';
    if (daysLeft === 1) return `${this.money(safePerDay)} to spend today`;
    return `${this.money(safePerDay)} a day to spend`;
  });

  protected readonly carry = computed(() => {
    const { carry } = this.progress();
    const previous = PREVIOUS_PERIOD[this.period()];
    if (carry > 0) return `Includes ${this.money(carry)} left over from ${previous}`;
    if (carry < 0) return `${this.money(-carry)} overspent ${previous} comes off this limit`;
    return '';
  });

  private money(minor: number): string {
    return formatMoney(minor, this.currency(), this.locale());
  }
}
