import { Injectable, effect, inject, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { BudgetProgress, alertDue } from '../../core/domain/budget';
import { formatMoney } from '../../core/domain/money';
import { Budget } from '../../core/models/budget';
import { Preferences } from '../../core/preferences';
import { Notifier } from '../notifications/notifier';
import { daysLeftLabel } from './budget-labels';
import { BudgetsStore } from './budgets.store';

/**
 * Budget alerts in the app (BUD-06, NTF-02): an alert when a budget reaches 80%
 * or 100% of its limit, once per threshold per period, unless the user turned
 * budget alerts off (NTF-04). `lastAlert` on the budget records what was sent,
 * so another device or the v1.1 `budgetAlerts` function doesn't send it again
 * (§12). Started once, from the app config.
 */
@Injectable({ providedIn: 'root' })
export class BudgetAlerts {
  private readonly store = inject(BudgetsStore);
  private readonly notifier = inject(Notifier);
  private readonly router = inject(Router);
  private readonly prefs = inject(Preferences);

  /** Alerts shown in this session, in case a snapshot arrives before `lastAlert` is written back. */
  private readonly shown = new Set<string>();

  constructor() {
    effect(() => {
      if (!this.prefs.notifications().budgetAlerts) return;
      const progress = this.store.progress();
      for (const budget of this.store.active()) {
        const current = progress.get(budget.id);
        if (!current) continue;
        const threshold = alertDue(budget, current);
        if (threshold === null) continue;
        const key = `${budget.id}|${current.range.start}|${threshold}`;
        if (this.shown.has(key)) continue;
        this.shown.add(key);
        untracked(() => this.alert(budget, current, threshold, key));
      }
    });
  }

  private alert(budget: Budget, progress: BudgetProgress, threshold: number, key: string): void {
    this.store.recordAlert(budget, progress.range.start, threshold);
    const money = (minor: number) => formatMoney(minor, this.store.currency(), this.prefs.locale());
    const over = progress.state === 'over';
    const used = progress.percent === null ? `${threshold}%` : `${progress.percent}%`;
    const left = daysLeftLabel(progress.daysLeft);
    this.notifier.deliver({
      id: `budget|${key}`,
      kind: 'budget',
      tone: over ? 'error' : 'warn',
      title: over ? `${budget.name}: over budget` : `${budget.name}: ${used} used`,
      message: !over
        ? `${money(progress.remaining)} left · ${left}`
        : progress.remaining < 0
          ? `${money(-progress.remaining)} over · ${left}`
          : `Nothing left to spend · ${left}`,
      link: `/budgets/${budget.id}`,
      actionLabel: 'View',
      open: () => this.router.navigate(['/budgets', budget.id]),
    });
  }
}
