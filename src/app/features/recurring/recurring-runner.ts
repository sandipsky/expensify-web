import { Injectable, effect, inject } from '@angular/core';
import { formatMoney } from '../../core/domain/money';
import { Preferences } from '../../core/preferences';
import { NavBadges } from '../../layout/nav-badges';
import { NotificationService } from '../../shared/components/ui/notification';
import { RecurringStore, RuleView } from './recurring.store';
import { entryCount } from './recurring-labels';

/**
 * Creates automatic rules' entries on their due date, and any missed while the
 * app was closed (REC-04, REC-06), from whichever screen is open. Until the
 * v1.1 generateRecurring Function runs on the server (§12), this is what does
 * it; both write occurrences in a transaction under fixed IDs, so a date is
 * created once however many devices are open (REC-05). Ask-first rules only
 * wait here: the Recurring page lists them for Confirm or Skip.
 */
@Injectable({ providedIn: 'root' })
export class RecurringRunner {
  private readonly store = inject(RecurringStore);
  private readonly notify = inject(NotificationService);
  private readonly locale = inject(Preferences).locale;

  /** Rules with a write in progress, so a rerun of the effect doesn't start a second one. */
  private readonly running = new Set<string>();

  constructor() {
    const badges = inject(NavBadges);
    effect(() => badges.recurring.set(this.store.waitingCount()));
    effect(() => {
      if (this.store.loading()) return;
      for (const view of this.store.views()) {
        if (view.rule.mode !== 'auto' || !view.due.length || this.running.has(view.id)) continue;
        this.run(view);
      }
    });
  }

  private async run(view: RuleView): Promise<void> {
    this.running.add(view.id);
    try {
      const created = await this.store.generate(view.rule);
      if (created) this.announce(view, created);
    } finally {
      this.running.delete(view.id);
    }
  }

  /** "Recurring entry added: Salary · +Rs 3,000.00", or how many a catch-up added. */
  private announce(view: RuleView, created: number): void {
    const amount = formatMoney(
      view.amount,
      this.store.currency(),
      this.locale(),
      view.kind === 'transfer' ? 'auto' : 'exceptZero',
    );
    if (created === 1) {
      this.notify.success('Recurring entry added', `${view.name} · ${amount}`);
    } else {
      this.notify.success(
        `${entryCount(created)} added`,
        `${view.name} · ${amount} each, including ones missed while the app was closed.`,
      );
    }
  }
}
