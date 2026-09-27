import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CategoryNode } from '../../../core/domain/category';
import { CATEGORY_TYPES, Category, CategoryType } from '../../../core/models/category';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { Accordion, AccordionItem } from '../../../shared/components/ui/accordion';
import { Breadcrumb } from '../../../shared/components/ui/breadcrumb';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { Skeleton } from '../../../shared/components/ui/skeleton';
import { Tab, Tabs } from '../../../shared/components/ui/tabs';
import { CategoriesStore } from '../categories.store';
import { CategoryActions } from '../category-actions';
import { CATEGORY_TYPE_LABELS, countOf, systemCaption } from '../category-labels';
import { CategoryRow } from '../category-row/category-row';

/**
 * `/categories`: expense and income categories on their own tabs (CAT-01),
 * parents with their subcategories (CAT-07), the system categories (CAT-05)
 * and archived ones (CAT-03).
 */
@Component({
  selector: 'app-categories-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Accordion,
    AccordionItem,
    Breadcrumb,
    Button,
    Card,
    CategoryRow,
    EmptyState,
    Icon,
    Skeleton,
    Tab,
    Tabs,
  ],
  templateUrl: './categories-page.html',
  styleUrl: './categories-page.scss',
})
export class CategoriesPage {
  protected readonly store = inject(CategoriesStore);
  protected readonly actions = inject(CategoryActions);

  protected readonly types = CATEGORY_TYPES;
  protected readonly labels = CATEGORY_TYPE_LABELS;
  protected readonly systemCaption = systemCaption;

  /** The open tab; "Add category" adds to it. */
  protected readonly type = signal<CategoryType>('expense');

  protected selectType(value: unknown): void {
    if (CATEGORY_TYPES.includes(value as CategoryType)) this.type.set(value as CategoryType);
  }

  protected add(type: CategoryType = this.type()): void {
    this.actions.create(type).subscribe();
  }

  protected addSubcategory(parent: Category): void {
    this.actions.create(parent.type, parent.id).subscribe();
  }

  protected subcategoryCaption(node: CategoryNode): string {
    return node.children.length
      ? countOf(node.children.length, 'subcategory', 'subcategories')
      : '';
  }

  /** Where an archived category sat, or what its archiving hides. */
  protected archivedCaption(category: Category): string {
    const parent = this.store.byId(category.parentId);
    if (parent) return `Subcategory of ${parent.name}`;
    const hidden = this.store.subcategories(category).filter((c) => !c.archived).length;
    return hidden ? `Hides ${countOf(hidden, 'subcategory', 'subcategories')}` : '';
  }
}
