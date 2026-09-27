import { Injectable, effect, inject, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { BudgetProgress, alertDue } from '../../core/domain/budget';
import { formatMoney } from '../../core/domain/money';
import { Budget } from '../../core/models/budget';
import { Preferences } from '../../core/preferences';
import { NotificationService } from '../../shared/components/ui/notification';
import { daysLeftLabel } from './budget-labels';
import { BudgetsStore } from './budgets.store';

/** Alerts stay up longer than a save toast: they're news, not confirmation. */
const ALERT_MS = 8000;

/**
 * Budget alerts in the app (BUD-06, NTF-02): a toast when a budget reaches 80%
 * or 100% of its limit, once per threshold per period. `lastAlert` on the
 * budget records what was sent, so another device or the v1.1 `budgetAlerts`
 * function doesn't send it again (§12). Started once, from the app config.
 */
@Injectable({ providedIn: 'root' })
export class BudgetAlerts {
  private readonly store = inject(BudgetsStore);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly locale = inject(Preferences).locale;

  /** Alerts shown in this session, in case a snapshot arrives before `lastAlert` is written back. */
  private readonly shown = new Set<string>();

  constructor() {
    effect(() => {
      const progress = this.store.progress();
      for (const budget of this.store.active()) {
        const current = progress.get(budget.id);
        if (!current) continue;
        const threshold = alertDue(budget, current);
        if (threshold === null) continue;
        const key = `${budget.id}|${current.range.start}|${threshold}`;
        if (this.shown.has(key)) continue;
        this.shown.add(key);
        untracked(() => this.alert(budget, current, threshold));
      }
    });
  }

  private alert(budget: Budget, progress: BudgetProgress, threshold: number): void {
    this.store.recordAlert(budget, progress.range.start, threshold);
    const money = (minor: number) => formatMoney(minor, this.store.currency(), this.locale());
    const options = {
      duration: ALERT_MS,
      action: { label: 'View', handler: () => this.router.navigate(['/budgets', budget.id]) },
    };
    if (progress.state === 'over') {
      const message =
        progress.remaining < 0
          ? `${money(-progress.remaining)} over · ${daysLeftLabel(progress.daysLeft)}`
          : `Nothing left to spend · ${daysLeftLabel(progress.daysLeft)}`;
      this.notify.error(`${budget.name}: over budget`, message, options);
    } else {
      const used = progress.percent === null ? `${threshold}%` : `${progress.percent}%`;
      this.notify.warn(
        `${budget.name}: ${used} used`,
        `${money(progress.remaining)} left · ${daysLeftLabel(progress.daysLeft)}`,
        options,
      );
    }
  }
}
