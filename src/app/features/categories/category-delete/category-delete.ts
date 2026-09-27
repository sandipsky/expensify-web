import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Category, SYSTEM_CATEGORY_IDS } from '../../../core/models/category';
import { Button } from '../../../shared/components/ui/button/button';
import { Select } from '../../../shared/components/ui/input/select/select';
import { injectSheet } from '../../../shared/services/sheet.service';
import { CategoriesStore, CategoryUsage } from '../categories.store';
import { countOf, usageSummary } from '../category-labels';

export interface CategoryDeleteData {
  category: Category;
  usage: CategoryUsage;
}

/** "12 transactions and 1 budget use Food and its 2 subcategories. …" */
function usageMessage(category: Category, usage: CategoryUsage): string {
  const subs = usage.categories.length - 1;
  const what = subs
    ? `${category.name} and its ${countOf(subs, 'subcategory', 'subcategories')}`
    : category.name;
  const one = usage.transactions.length + usage.budgets.length === 1;
  return `${usageSummary(usage)} ${one ? 'uses' : 'use'} ${what}. Choose where ${one ? 'it goes' : 'they go'}, then delete.`;
}

/**
 * The step before deleting a category that transactions or budgets use: pick
 * the category they move to (CAT-06). Closes with the replacement's ID, or
 * nothing when cancelled; the caller does the delete. Uncategorized is the
 * default, since it's there for exactly this.
 */
@Component({
  selector: 'app-category-delete',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button, Select],
  templateUrl: './category-delete.html',
  styleUrl: './category-delete.scss',
})
export class CategoryDelete {
  protected readonly sheet = injectSheet<CategoryDeleteData, string>();
  private readonly store = inject(CategoriesStore);

  protected readonly category = this.sheet.data!.category;
  private readonly usage = this.sheet.data!.usage;

  protected readonly items = this.store
    .replacements(this.category)
    .map((c) => ({ value: c.id, label: this.store.path(c) }));

  protected readonly message = usageMessage(this.category, this.usage);

  protected readonly replacement = new FormControl<string | null>(
    this.items.some((i) => i.value === SYSTEM_CATEGORY_IDS[this.category.type].uncategorized)
      ? SYSTEM_CATEGORY_IDS[this.category.type].uncategorized
      : null,
    Validators.required,
  );

  protected confirm(): void {
    if (this.replacement.invalid || !this.replacement.value) {
      this.replacement.markAsTouched();
      return;
    }
    this.sheet.close(this.replacement.value);
  }
}
