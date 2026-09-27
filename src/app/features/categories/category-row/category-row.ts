import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Category } from '../../../core/models/category';
import { SymbolIcon } from '../../../shared/components/symbol-icon/symbol-icon';
import { Button } from '../../../shared/components/ui/button/button';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { Menu } from '../../../shared/components/ui/menu';

/**
 * One category on the Categories page: its icon, name and a caption, and a
 * menu with its actions. Tapping an active category edits it. System
 * categories show a lock instead of a menu, since they can't be changed
 * (CAT-05).
 */
@Component({
  selector: 'app-category-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Icon, Menu, SymbolIcon],
  templateUrl: './category-row.html',
  styleUrl: './category-row.scss',
  host: { '[class.is-nested]': 'nested()' },
})
export class CategoryRow {
  readonly category = input.required<Category>();
  /** Shown under the name, such as its subcategory count. */
  readonly caption = input('');
  /** A subcategory listed under its parent, indented. */
  readonly nested = input(false);
  /** Offer "Add subcategory"; only active top-level categories can take one (CAT-07). */
  readonly canAddSubcategory = input(false);

  readonly edit = output<void>();
  readonly addSubcategory = output<void>();
  readonly archive = output<void>();
  readonly restore = output<void>();
  readonly delete = output<void>();
}
