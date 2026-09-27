import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { Category, CategoryType } from '../../core/models/category';
import { NotificationService } from '../../shared/components/ui/notification';
import { SheetService } from '../../shared/services/sheet.service';
import { CategoriesStore } from './categories.store';
import { CategoryDelete, CategoryDeleteData } from './category-delete/category-delete';
import { CategoryForm, CategoryFormData } from './category-form/category-form';
import { countOf, usageSummary } from './category-labels';

/** Undo window for single deletes and archives (TXN-07). */
const UNDO_MS = 5000;

/** Wide enough for eight icon tiles a row. */
const FORM_WIDTH = '560px';

/** The categories screen's user flows: forms, the replacement step, and Undo. */
@Injectable({ providedIn: 'root' })
export class CategoryActions {
  private readonly store = inject(CategoriesStore);
  private readonly sheets = inject(SheetService);
  private readonly notify = inject(NotificationService);

  /**
   * Opens the add form (CAT-02), for a subcategory when `parentId` is given
   * (CAT-07). Emits the new category's ID, or `undefined` if cancelled.
   */
  create(type: CategoryType, parentId: string | null = null): Observable<string | undefined> {
    return this.sheets.open<string, CategoryFormData>(
      CategoryForm,
      { type, parentId },
      { width: FORM_WIDTH },
    );
  }

  edit(category: Category): void {
    this.sheets.open<string, CategoryFormData>(CategoryForm, { category }, { width: FORM_WIDTH });
  }

  /** Adds the Appendix A categories (ONB-02) for someone starting with an empty list. */
  seedDefaults(): void {
    this.store.seedDefaults();
    this.notify.success('Default categories added', 'Rename, recolor or archive any of them.');
  }

  /** Archives at once, with Undo (CAT-03). */
  archive(category: Category): void {
    const hidden = this.store.subcategories(category).filter((c) => !c.archived).length;
    this.store.setArchived(category, true);
    const message = hidden
      ? `${category.name} and its ${countOf(hidden, 'subcategory', 'subcategories')} are hidden from pickers.`
      : category.name;
    this.notify.success('Category archived', message, {
      duration: UNDO_MS,
      action: { label: 'Undo', handler: () => this.store.setArchived(category, false) },
    });
  }

  restore(category: Category): void {
    const [first, second] = this.store.restore(category);
    const message = second ? `${second.name}, with ${first.name}` : first.name;
    this.notify.success('Category restored', message);
  }

  /**
   * Deletes a category nothing uses at once, with Undo. A used one first asks
   * where its transactions and budgets go, then moves them and deletes it in
   * one write (CAT-06). Subcategories go with their parent. Resolves to whether
   * anything was deleted.
   */
  async delete(category: Category): Promise<boolean> {
    if (category.isSystem) return false;
    const usage = await this.store.usage(category);

    if (!usage.transactions.length && !usage.budgets.length) {
      const deleted = await this.store.delete(category, null);
      const subs = deleted.categories.length - 1;
      this.notify.info(
        'Category deleted',
        subs
          ? `${category.name} and ${countOf(subs, 'subcategory', 'subcategories')}`
          : category.name,
        {
          duration: UNDO_MS,
          action: { label: 'Undo', handler: () => this.store.undoDelete(deleted.categories) },
        },
      );
      return true;
    }

    const replacementId = await firstValueFrom(
      this.sheets.open<string, CategoryDeleteData>(CategoryDelete, { category, usage }),
    );
    if (!replacementId) return false;
    const moved = await this.store.delete(category, replacementId);
    const replacement = this.store.byId(replacementId);
    this.notify.success(
      'Category deleted',
      `${usageSummary(moved)} moved to ${replacement ? this.store.path(replacement) : 'another category'}.`,
    );
    return true;
  }
}
