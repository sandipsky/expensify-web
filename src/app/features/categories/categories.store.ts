import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BudgetsRepo } from '../../core/data/budgets.repo';
import { CategoriesRepo, CategoryChanges } from '../../core/data/categories.repo';
import { RecurringRepo } from '../../core/data/recurring.repo';
import { TransactionsRepo } from '../../core/data/transactions.repo';
import {
  CategoryNode,
  categoryPath,
  categoryTree,
  compareCategories,
  isNameTaken,
  parentCandidates,
  pickableCategories,
} from '../../core/domain/category';
import { DEFAULT_CATEGORIES } from '../../core/domain/default-categories';
import { Budget } from '../../core/models/budget';
import { Category, CategoryInput, CategoryType } from '../../core/models/category';
import { RecurringRule } from '../../core/models/recurring';
import { Transaction } from '../../core/models/transaction';

/** How the Categories page lists one type's categories. */
export interface CategoryLists {
  /** Active parents, each with its active subcategories (CAT-07). */
  tree: CategoryNode[];
  /** Uncategorized and Balance adjustment (CAT-05). */
  system: Category[];
  /** Archived categories, parents and subcategories alike (CAT-03). */
  archived: Category[];
}

/** What a category and its subcategories are used by, which decides how deleting it works (CAT-06). */
export interface CategoryUsage {
  /** The category first, then its subcategories: deleting it deletes them too. */
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  /** Recurring rules whose entries use them. */
  rules: RecurringRule[];
}

/** Whether anything would point at the category once it's gone (CAT-06). */
export function isUsed(usage: Pick<CategoryUsage, 'transactions' | 'budgets' | 'rules'>): boolean {
  return usage.transactions.length > 0 || usage.budgets.length > 0 || usage.rules.length > 0;
}

/**
 * Categories state for the whole app: the Categories page now, and the
 * transaction form's picker, reports and budgets later, share this one
 * listener. Root-provided for that reason.
 */
@Injectable({ providedIn: 'root' })
export class CategoriesStore {
  private readonly repo = inject(CategoriesRepo);
  private readonly transactions = inject(TransactionsRepo);
  private readonly budgets = inject(BudgetsRepo);
  private readonly rules = inject(RecurringRepo);

  private readonly _all = toSignal(this.repo.watchAll());

  /** True until the first snapshot arrives; skeletons show only then. */
  readonly loading = computed(() => this._all() === undefined);
  readonly all = computed(() => this._all() ?? []);
  private readonly _byId = computed(() => new Map(this.all().map((c) => [c.id, c])));

  readonly lists = computed<Record<CategoryType, CategoryLists>>(() => ({
    expense: this.listsOf('expense'),
    income: this.listsOf('income'),
  }));

  /** What pickers offer per type: archived categories and Balance adjustment are left out. */
  readonly pickable = computed<Record<CategoryType, Category[]>>(() => ({
    expense: pickableCategories(this.all(), 'expense'),
    income: pickableCategories(this.all(), 'income'),
  }));

  byId(id: string | null | undefined): Category | undefined {
    return id ? this._byId().get(id) : undefined;
  }

  /** "Food and dining › Groceries" for a subcategory; the name otherwise. */
  path(category: Category): string {
    return categoryPath(category, this._byId());
  }

  /** Every subcategory of the category, archived ones too. */
  subcategories(category: Category): Category[] {
    return this.all()
      .filter((c) => c.parentId === category.id)
      .sort(compareCategories);
  }

  /**
   * Parents the form offers (CAT-07). An archived current parent stays on the
   * list, so editing doesn't quietly move the category to the top level.
   */
  parentOptions(type: CategoryType, category?: Category): Category[] {
    const options = parentCandidates(this.all(), type, category);
    const current = this.byId(category?.parentId);
    return current && !options.includes(current) ? [current, ...options] : options;
  }

  /** Where a deleted category's entries can go: what pickers offer, minus what's being deleted. */
  replacements(category: Category): Category[] {
    const removed = new Set([category.id, ...this.subcategories(category).map((c) => c.id)]);
    return this.pickable()[category.type].filter((c) => !removed.has(c.id));
  }

  /** Unique per type and parent, ignoring case (CAT-04). Pass `exceptId` when renaming. */
  isNameTaken(
    name: string,
    type: CategoryType,
    parentId: string | null,
    exceptId?: string,
  ): boolean {
    return isNameTaken(this.all(), { name, type, parentId, id: exceptId });
  }

  /** Writes the Appendix A categories that are missing (ONB-02, ONB-03). Onboarding calls this too. */
  seedDefaults(): void {
    this.repo.seed(DEFAULT_CATEGORIES.filter((c) => !this.byId(c.id)));
  }

  /**
   * Adds a category at the end of its type's list and returns its ID (CAT-02).
   * The system categories are written too if they're missing, so they exist
   * as soon as the user has categories (CAT-05).
   */
  create(type: CategoryType, input: CategoryInput): string {
    this.repo.seed(DEFAULT_CATEGORIES.filter((c) => c.isSystem && !this.byId(c.id)));
    const sameType = this.all().filter((c) => c.type === type);
    return this.repo.create({
      name: input.name.trim(),
      type,
      parentId: input.parentId,
      icon: input.icon,
      color: input.color,
      isSystem: false,
      archived: false,
      sortOrder: Math.max(-1, ...sameType.map((c) => c.sortOrder)) + 1,
    });
  }

  /** Saves the fields that changed (CAT-02). System categories are fixed (CAT-05). */
  update(category: Category, input: CategoryInput): void {
    if (category.isSystem) return;
    const next: CategoryChanges = {
      name: input.name.trim(),
      parentId: input.parentId,
      icon: input.icon,
      color: input.color,
    };
    const changes = Object.fromEntries(
      Object.entries(next).filter(([key, value]) => category[key as keyof Category] !== value),
    ) as CategoryChanges;
    if (Object.keys(changes).length) this.repo.update(category.id, changes);
  }

  /** Archiving a parent hides its subcategories with it, without archiving them (CAT-03). */
  setArchived(category: Category, archived: boolean): void {
    if (category.isSystem) return;
    this.repo.setArchived([category.id], archived);
  }

  /**
   * Brings an archived category back, with its parent when that's archived
   * too, since a subcategory can't show under a hidden parent. Returns what
   * was restored.
   */
  restore(category: Category): Category[] {
    const parent = this.byId(category.parentId);
    const restored = parent?.archived ? [parent, category] : [category];
    this.repo.setArchived(
      restored.map((c) => c.id),
      false,
    );
    return restored;
  }

  /** What uses the category or its subcategories (CAT-06). */
  async usage(category: Category): Promise<CategoryUsage> {
    const categories = [category, ...this.subcategories(category)];
    const [transactions, budgets, rules] = await Promise.all([
      Promise.all(categories.map((c) => this.transactions.listByCategory(c.id))),
      Promise.all(categories.map((c) => this.budgets.listByCategory(c.id))),
      Promise.all(categories.map((c) => this.rules.listByCategory(c.id))),
    ]);
    // A budget can name the parent and a subcategory both.
    const uniqueBudgets = new Map(budgets.flat().map((b) => [b.id, b]));
    return {
      categories,
      transactions: transactions.flat(),
      budgets: [...uniqueBudgets.values()],
      rules: rules.flat(),
    };
  }

  /**
   * Deletes the category and its subcategories (CAT-06). Their transactions and
   * budgets move to `replacementId` in the same write; it's required when
   * anything uses them. Usage is read again here, so entries added since the
   * user was asked move too. Resolves to what was deleted and moved.
   */
  async delete(category: Category, replacementId: string | null): Promise<CategoryUsage> {
    if (category.isSystem) throw new Error("System categories can't be deleted.");
    const usage = await this.usage(category);
    const ids = usage.categories.map((c) => c.id);
    const used = isUsed(usage);
    if (used && (!replacementId || ids.includes(replacementId))) {
      throw new Error('A used category needs a replacement before it can be deleted.');
    }
    this.repo.delete(
      ids,
      used && replacementId
        ? {
            replacementId,
            transactions: usage.transactions,
            budgets: usage.budgets,
            rules: usage.rules,
          }
        : undefined,
    );
    return usage;
  }

  /** Undoes the delete of categories nothing used. */
  undoDelete(categories: readonly Category[]): void {
    this.repo.restore(categories);
  }

  private listsOf(type: CategoryType): CategoryLists {
    const ofType = this.all().filter((c) => c.type === type);
    return {
      tree: categoryTree(this.all(), type),
      system: ofType.filter((c) => c.isSystem).sort(compareCategories),
      archived: ofType.filter((c) => c.archived && !c.isSystem).sort(compareCategories),
    };
  }
}
