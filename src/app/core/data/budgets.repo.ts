import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { DEFAULT_ALERT_THRESHOLDS } from '../domain/budget';
import { BUDGET_PERIODS, Budget, BudgetAlert, NewBudget } from '../models/budget';
import { LocalBatch, LocalDb, LocalDoc, serverTimestamp } from './local-db';
import { WriteErrors } from './write-errors';

/** Fields an edit may change. */
export type BudgetChanges = Partial<
  Pick<
    Budget,
    'name' | 'amount' | 'period' | 'categoryIds' | 'rollover' | 'alertThresholds' | 'active'
  >
>;

/**
 * `users/{uid}/budgets` (§8). Writes return before they're confirmed and hand
 * failures to `WriteErrors`, so screens update from the local cache at once (NFR-03).
 */
@Injectable({ providedIn: 'root' })
export class BudgetsRepo {
  private readonly db = inject(LocalDb);
  private readonly errors = inject(WriteErrors);
  private readonly path = `${this.db.userPath}/budgets`;

  /** Every budget, paused ones too. A handful at most, so one listener serves the app. */
  watchAll(): Observable<Budget[]> {
    return this.db.watch(this.path).pipe(map((docs) => docs.map(toBudget)));
  }

  /** Budgets that name the category (single-field `array-contains`, no composite index). */
  async listByCategory(categoryId: string): Promise<Budget[]> {
    const docs = await this.db.get(this.path, {
      where: [['categoryIds', 'array-contains', categoryId]],
    });
    return docs.map(toBudget);
  }

  /** Writes a new budget and returns its ID (BUD-01). */
  create(budget: NewBudget): string {
    const id = this.db.newId();
    this.commit(
      this.db.batch().set(this.doc(id), {
        ...budget,
        lastAlert: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    return id;
  }

  /** Writes only the fields passed, so another device's edits to other fields survive (SYN-03). */
  update(id: string, changes: BudgetChanges): void {
    this.commit(this.db.batch().update(this.doc(id), { ...changes, updatedAt: serverTimestamp() }));
  }

  /** Records the alert just shown, so it isn't sent again this period (BUD-06). */
  recordAlert(id: string, alert: BudgetAlert): void {
    this.commit(
      this.db.batch().update(this.doc(id), { lastAlert: alert, updatedAt: serverTimestamp() }),
    );
  }

  delete(id: string): void {
    this.commit(this.db.batch().delete(this.doc(id)));
  }

  /** Puts back a budget deleted moments ago (Undo), under its old ID with its old fields. */
  restore(budget: Budget): void {
    const { id, pending: _pending, ...fields } = budget;
    this.commit(this.db.batch().set(this.doc(id), { ...fields, updatedAt: serverTimestamp() }));
  }

  private doc(id: string): string {
    return `${this.path}/${id}`;
  }

  // Not awaited: offline, a commit resolves only once the server confirms (§10).
  private commit(batch: LocalBatch): void {
    batch.commit().catch((error) => this.errors.report(error));
  }
}

/** Fills the fields an older or Android-written document may lack. */
function toBudget(doc: LocalDoc): Budget {
  const data = doc.data as Partial<Budget>;
  return {
    ...data,
    id: doc.id,
    name: data.name ?? '',
    amount: data.amount ?? 0,
    // A period this version doesn't know yet reads as monthly rather than breaking the page.
    period: data.period && BUDGET_PERIODS.includes(data.period) ? data.period : 'monthly',
    categoryIds: data.categoryIds ?? [],
    rollover: data.rollover ?? false,
    alertThresholds: data.alertThresholds ?? [...DEFAULT_ALERT_THRESHOLDS],
    lastAlert: data.lastAlert ?? null,
    active: data.active ?? true,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    pending: false,
  } as Budget;
}
