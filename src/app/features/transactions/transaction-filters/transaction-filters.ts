import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import {
  currencySymbol,
  fractionDigits,
  toMajorUnits,
  toMinorUnits,
} from '../../../core/domain/money';
import { NO_FILTER, TransactionFilter } from '../../../core/domain/transactions';
import {
  ADJUSTMENT_CATEGORY_IDS,
  CATEGORY_TYPES,
  CategoryType,
} from '../../../core/models/category';
import { TxType } from '../../../core/models/transaction';
import { Preferences } from '../../../core/preferences';
import { Button } from '../../../shared/components/ui/button/button';
import { NumberInput } from '../../../shared/components/ui/input/number-input/number-input';
import { Select } from '../../../shared/components/ui/input/select/select';
import { SegmentedControl } from '../../../shared/components/ui/segmented-control';
import { injectSheet } from '../../../shared/services/sheet.service';
import { AccountsStore } from '../../accounts/accounts.store';
import { CategoriesStore } from '../../categories/categories.store';
import { TX_TYPE_LABELS, TX_TYPE_OPTIONS } from '../transaction-labels';

export interface TransactionFiltersData {
  filter: TransactionFilter;
  /** Tags used in the loaded period, to filter by (LST-07). */
  tags: string[];
  currency: string;
}

const ALL = 'all';

/**
 * The list's filters besides the period and search (LST-02, LST-07): type,
 * accounts, categories, tags and an amount range. They combine, and apply
 * when the user taps Apply; the search text passes through untouched.
 */
@Component({
  selector: 'app-transaction-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button, NumberInput, Select, SegmentedControl],
  templateUrl: './transaction-filters.html',
  styleUrl: './transaction-filters.scss',
})
export class TransactionFilters {
  protected readonly sheet = injectSheet<TransactionFiltersData, TransactionFilter>();
  private readonly accounts = inject(AccountsStore);
  private readonly categories = inject(CategoriesStore);

  private readonly start = this.sheet.data?.filter ?? NO_FILTER;
  protected readonly tags = this.sheet.data?.tags ?? [];
  private readonly currency = this.sheet.data?.currency ?? inject(Preferences).baseCurrency();
  protected readonly decimalPlaces = fractionDigits(this.currency);
  protected readonly symbol = currencySymbol(this.currency, inject(Preferences).locale());

  protected readonly typeOptions = [{ value: ALL, label: 'All' }, ...TX_TYPE_OPTIONS];

  protected readonly form = inject(FormBuilder).nonNullable.group({
    type: [(this.start.type ?? ALL) as TxType | typeof ALL],
    accountIds: [[...this.start.accountIds]],
    categoryIds: [[...this.start.categoryIds]],
    tags: [[...this.start.tags]],
    min: [this.toMajor(this.start.minAmount)],
    max: [this.toMajor(this.start.maxAmount)],
  });

  private readonly type = toSignal(this.form.controls.type.valueChanges, {
    initialValue: this.form.controls.type.value,
  });

  /** Every account, archived ones too: their history is still in the list. */
  protected readonly accountItems = this.accounts
    .all()
    .map((a) => ({ value: a.id, label: a.archived ? `${a.name} (archived)` : a.name }));

  /** Categories of the chosen type (both when none is); transfers have none. */
  protected readonly categoryItems = computed(() => {
    const type = this.type();
    if (type === 'transfer') return [];
    const types = type === ALL ? CATEGORY_TYPES : [type];
    return types.flatMap((t) => this.categoryItemsOf(t));
  });

  constructor() {
    // A category of the other type can't match, so switching type drops it.
    this.form.controls.type.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const allowed = new Set(this.categoryItems().map((c) => c.value));
      const { categoryIds } = this.form.controls;
      categoryIds.setValue(categoryIds.value.filter((id) => allowed.has(id)));
    });
  }

  protected reset(): void {
    this.form.reset({
      type: ALL,
      accountIds: [],
      categoryIds: [],
      tags: [],
      min: null,
      max: null,
    });
  }

  protected apply(): void {
    const value = this.form.getRawValue();
    let min = value.min === null ? null : toMinorUnits(value.min, this.currency);
    let max = value.max === null ? null : toMinorUnits(value.max, this.currency);
    if (min !== null && max !== null && min > max) [min, max] = [max, min];
    this.sheet.close({
      ...this.start,
      type: value.type === ALL ? null : value.type,
      accountIds: value.accountIds,
      categoryIds: value.type === 'transfer' ? [] : value.categoryIds,
      tags: value.tags,
      minAmount: min,
      maxAmount: max,
    });
  }

  /** Active categories as pickers list them, then archived ones; never Balance adjustment. */
  private categoryItemsOf(type: CategoryType) {
    const group = TX_TYPE_LABELS[type];
    const active = this.categories.pickable()[type];
    const archived = this.categories.lists()[type].archived;
    return [...active, ...archived]
      .filter((c) => !ADJUSTMENT_CATEGORY_IDS.includes(c.id))
      .map((c) => ({
        value: c.id,
        label: c.archived ? `${this.categories.path(c)} (archived)` : this.categories.path(c),
        group,
      }));
  }

  private toMajor(minor: number | null): number | null {
    return minor === null ? null : toMajorUnits(minor, this.currency);
  }
}
