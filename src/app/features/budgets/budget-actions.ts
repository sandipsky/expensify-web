import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Budget } from '../../core/models/budget';
import { NotificationService } from '../../shared/components/ui/notification';
import { SheetService } from '../../shared/services/sheet.service';
import { BudgetForm, BudgetFormData } from './budget-form/budget-form';
import { BudgetsStore } from './budgets.store';

/** Undo window for single deletes (TXN-07). */
const UNDO_MS = 5000;

/** The budget screens' user flows: the form, pausing, and delete with Undo. */
@Injectable({ providedIn: 'root' })
export class BudgetActions {
  private readonly store = inject(BudgetsStore);
  private readonly sheets = inject(SheetService);
  private readonly notify = inject(NotificationService);

  /** Opens the add form (BUD-01). Emits the new budget's ID, or `undefined` if cancelled. */
  create(): Observable<string | undefined> {
    return this.sheets.open<string, BudgetFormData>(BudgetForm, {});
  }

  edit(budget: Budget): void {
    this.sheets.open<string, BudgetFormData>(BudgetForm, { budget });
  }

  /** Pausing keeps the budget's settings; it just stops tracking and alerting. */
  pause(budget: Budget): void {
    this.store.setActive(budget, false);
    this.notify.success('Budget paused', budget.name, {
      duration: UNDO_MS,
      action: { label: 'Undo', handler: () => this.store.setActive(budget, true) },
    });
  }

  resume(budget: Budget): void {
    this.store.setActive(budget, true);
    this.notify.success('Budget resumed', budget.name);
  }

  /** Deletes at once, with a 5-second Undo. Transactions aren't touched. */
  delete(budget: Budget): void {
    this.store.delete(budget);
    this.notify.info('Budget deleted', budget.name, {
      duration: UNDO_MS,
      action: { label: 'Undo', handler: () => this.store.restore(budget) },
    });
  }
}
