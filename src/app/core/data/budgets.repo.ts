import { Injectable, inject } from '@angular/core';
import { Budget } from '../models/budget';
import { LocalDb, LocalDoc } from './local-db';

/**
 * `users/{uid}/budgets` (§8). Only the read that deleting a category needs so
 * far (CAT-06); the budgets feature (M2) adds the rest.
 */
@Injectable({ providedIn: 'root' })
export class BudgetsRepo {
  private readonly db = inject(LocalDb);
  private readonly path = `${this.db.userPath}/budgets`;

  /** Budgets that name the category (single-field `array-contains`, no composite index). */
  async listByCategory(categoryId: string): Promise<Budget[]> {
    const docs = await this.db.get(this.path, {
      where: [['categoryIds', 'array-contains', categoryId]],
    });
    return docs.map(toBudget);
  }
}

/** Fills the fields an older or Android-written document may lack. */
function toBudget(doc: LocalDoc): Budget {
  const data = doc.data as Partial<Budget>;
  return {
    ...data,
    id: doc.id,
    categoryIds: data.categoryIds ?? [],
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  } as Budget;
}
