import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { DEFAULT_CATEGORY_ICON, PALETTE, replaceCategoryIds } from '../domain/category';
import { SeedCategory } from '../domain/default-categories';
import { Budget } from '../models/budget';
import { Category } from '../models/category';
import { RecurringRule } from '../models/recurring';
import { Transaction } from '../models/transaction';
import { LocalBatch, LocalDb, LocalDoc, serverTimestamp } from './local-db';
import { WriteErrors } from './write-errors';

/** What a new category is written with; the repo adds the audit fields. */
export type NewCategory = Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'pending'>;

/** Fields an edit may change. The type is fixed once transactions can use the category. */
export type CategoryChanges = Partial<Pick<Category, 'name' | 'parentId' | 'icon' | 'color'>>;

/** What deleting a used category moves to its replacement (CAT-06). */
export interface Reassignment {
  replacementId: string;
  transactions: readonly Pick<Transaction, 'id'>[];
  budgets: readonly Pick<Budget, 'id' | 'categoryIds'>[];
  /** Recurring rules whose entries use the category. */
  rules?: readonly Pick<RecurringRule, 'id'>[];
}

/**
 * `users/{uid}/categories` (§8). Writes return before they're confirmed and hand
 * failures to `WriteErrors`, so screens update from the local cache at once (NFR-03).
 */
@Injectable({ providedIn: 'root' })
export class CategoriesRepo {
  private readonly db = inject(LocalDb);
  private readonly errors = inject(WriteErrors);
  private readonly path = `${this.db.userPath}/categories`;

  /** Every category, archived ones too, by `sortOrder`. A few dozen at most, so one listener serves the app. */
  watchAll(): Observable<Category[]> {
    return this.db
      .watch(this.path, { orderBy: [['sortOrder', 'asc']] })
      .pipe(map((docs) => docs.map(toCategory)));
  }

  /** Writes a new category and returns its ID. */
  create(category: NewCategory): string {
    const id = this.db.newId();
    this.commit(
      this.db.batch().set(this.doc(id), {
        ...category,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    return id;
  }

  /**
   * Writes seed categories under their fixed IDs in one batch (ONB-03). Pass only
   * the missing ones: a set replaces the whole document, so writing one again
   * would undo the user's edits. With Firestore, judge what's missing from a
   * snapshot that isn't `fromCache`, or a device that hasn't synced yet could
   * overwrite categories another device already changed.
   */
  seed(categories: readonly SeedCategory[]): void {
    if (!categories.length) return;
    const batch = this.db.batch();
    for (const { id, ...fields } of categories) {
      batch.set(this.doc(id), {
        ...fields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    this.commit(batch);
  }

  /** An ID for a category not written yet, so entries written with it can refer to it. */
  newId(): string {
    return this.db.newId();
  }

  /**
   * Writes new categories under IDs from `newId()`, in one batch, as an import
   * does for names it didn't find (DAT-02). Parents must come first.
   */
  createMany(categories: readonly SeedCategory[]): void {
    this.seed(categories);
  }

  /** Writes only the fields passed, so another device's edits to other fields survive (SYN-03). */
  update(id: string, changes: CategoryChanges): void {
    this.commit(this.db.batch().update(this.doc(id), { ...changes, updatedAt: serverTimestamp() }));
  }

  /** Archived categories leave pickers; transactions keep them (CAT-03). */
  setArchived(ids: readonly string[], archived: boolean): void {
    const batch = this.db.batch();
    for (const id of ids) batch.update(this.doc(id), { archived, updatedAt: serverTimestamp() });
    this.commit(batch);
  }

  /** Puts back categories deleted moments ago (Undo), under their old IDs with their old fields. */
  restore(categories: readonly Category[]): void {
    const batch = this.db.batch();
    for (const { id, pending: _pending, ...fields } of categories) {
      batch.set(this.doc(id), { ...fields, updatedAt: serverTimestamp() });
    }
    this.commit(batch);
  }

  /**
   * Deletes the categories in one batch. With a reassignment, the same batch
   * moves their transactions, budgets and recurring rules to the replacement first (CAT-06), so
   * nothing is ever left pointing at a deleted category. Firestore caps a batch
   * at 500 writes, so the Firestore version must chunk, keeping the category
   * deletes in the last chunk.
   */
  delete(ids: readonly string[], reassignment?: Reassignment): void {
    const batch = this.db.batch();
    if (reassignment) {
      const { replacementId } = reassignment;
      for (const tx of reassignment.transactions) {
        batch.update(`${this.db.userPath}/transactions/${tx.id}`, {
          categoryId: replacementId,
          updatedAt: serverTimestamp(),
        });
      }
      const removed = new Set(ids);
      for (const budget of reassignment.budgets) {
        batch.update(`${this.db.userPath}/budgets/${budget.id}`, {
          categoryIds: replaceCategoryIds(budget.categoryIds, removed, replacementId),
          updatedAt: serverTimestamp(),
        });
      }
      for (const rule of reassignment.rules ?? []) {
        batch.update(`${this.db.userPath}/recurringRules/${rule.id}`, {
          'template.categoryId': replacementId,
          updatedAt: serverTimestamp(),
        });
      }
    }
    for (const id of ids) batch.delete(this.doc(id));
    this.commit(batch);
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
function toCategory(doc: LocalDoc): Category {
  const data = doc.data as Partial<Category>;
  return {
    ...data,
    id: doc.id,
    parentId: data.parentId ?? null,
    icon: data.icon ?? DEFAULT_CATEGORY_ICON,
    color: data.color ?? PALETTE.slate,
    isSystem: data.isSystem ?? false,
    archived: data.archived ?? false,
    sortOrder: data.sortOrder ?? 0,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    pending: false,
  } as Category;
}
