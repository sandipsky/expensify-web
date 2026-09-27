import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MAX_BUDGET_NAME, budgetPeriodRange } from '../../../core/domain/budget';
import {
  MAX_AMOUNT,
  currencySymbol,
  fractionDigits,
  toMajorUnits,
  toMinorUnits,
} from '../../../core/domain/money';
import { formatPeriod } from '../../../core/domain/period';
import { Budget, BudgetInput, BudgetPeriod } from '../../../core/models/budget';
import { Category } from '../../../core/models/category';
import { Preferences } from '../../../core/preferences';
import { Button } from '../../../shared/components/ui/button/button';
import { NumberInput } from '../../../shared/components/ui/input/number-input/number-input';
import { Select } from '../../../shared/components/ui/input/select/select';
import { TextInput } from '../../../shared/components/ui/input/text-input/text-input';
import { Toggle } from '../../../shared/components/ui/input/toggle/toggle';
import { NotificationService } from '../../../shared/components/ui/notification';
import { SegmentedControl } from '../../../shared/components/ui/segmented-control';
import { injectSheet } from '../../../shared/services/sheet.service';
import { CategoriesStore } from '../../categories/categories.store';
import {
  BUDGET_PERIOD_LABELS,
  BUDGET_PERIOD_OPTIONS,
  PREVIOUS_PERIOD,
  suggestBudgetName,
} from '../budget-labels';
import { BudgetsStore } from '../budgets.store';

export interface BudgetFormData {
  /** The budget to edit; omit to add one. */
  budget?: Budget;
}

/** Required that also rejects names made only of spaces. */
function notBlank(control: AbstractControl<string | null>): ValidationErrors | null {
  return (control.value ?? '').trim() ? null : { required: true };
}

/**
 * Add or edit a budget (BUD-01): a limit per week, month or year (BUD-08) for
 * every expense or for chosen categories, with rollover (BUD-07) and alerts
 * (BUD-06). The limit field holds major units, as `l-number-input` does, and
 * becomes integer minor units only on save (BR-01). A new budget's name follows
 * its categories until the user types one.
 */
@Component({
  selector: 'app-budget-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button, NumberInput, SegmentedControl, Select, TextInput, Toggle],
  templateUrl: './budget-form.html',
  styleUrl: './budget-form.scss',
})
export class BudgetForm {
  protected readonly sheet = injectSheet<BudgetFormData, string>();
  private readonly store = inject(BudgetsStore);
  private readonly categories = inject(CategoriesStore);
  private readonly notify = inject(NotificationService);
  private readonly locale = inject(Preferences).locale;

  protected readonly budget = this.sheet.data?.budget;
  private readonly currency = this.store.currency();
  protected readonly decimalPlaces = fractionDigits(this.currency);
  protected readonly symbol = currencySymbol(this.currency, this.locale());
  protected readonly periodOptions = BUDGET_PERIOD_OPTIONS;

  /** BR-03's cap, and the smallest unit, in the major units the field holds. */
  private readonly max = toMajorUnits(MAX_AMOUNT, this.currency);
  private readonly min = toMajorUnits(1, this.currency);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: [
      this.budget?.name ?? suggestBudgetName([]),
      [notBlank, Validators.maxLength(MAX_BUDGET_NAME)],
    ],
    amount: [
      this.budget ? toMajorUnits(this.budget.amount, this.currency) : (null as number | null),
      [Validators.required, Validators.min(this.min), Validators.max(this.max)],
    ],
    period: [this.budget?.period ?? ('monthly' as BudgetPeriod)],
    categoryIds: [[...(this.budget?.categoryIds ?? [])]],
    rollover: [this.budget?.rollover ?? false],
    alerts: [this.budget ? this.budget.alertThresholds.length > 0 : true],
  });

  protected readonly period = toSignal(this.form.controls.period.valueChanges, {
    initialValue: this.form.controls.period.value,
  });

  protected readonly amountLabel = computed(() => `${BUDGET_PERIOD_LABELS[this.period()]} limit`);

  /** "This period: 21–27 Sep 2026", so a start day other than 1 is no surprise (BR-05). */
  protected readonly periodHint = computed(() => {
    const range = budgetPeriodRange(this.period(), this.store.today(), this.store.settings());
    return `This period: ${formatPeriod(range, this.locale())}`;
  });

  protected readonly rolloverHint = computed(
    () =>
      `Adds what's left from ${PREVIOUS_PERIOD[this.period()]} to this one, or takes an overspend off it.`,
  );

  protected readonly categoryItems = this.categoryItemsFor(this.budget);

  constructor() {
    // A new budget's name follows its categories until the user edits it.
    if (!this.budget) {
      const { name, categoryIds } = this.form.controls;
      categoryIds.valueChanges.pipe(takeUntilDestroyed()).subscribe((ids) => {
        if (name.dirty) return;
        const names = ids
          .map((id) => this.categories.byId(id)?.name)
          .filter((n): n is string => !!n);
        name.setValue(suggestBudgetName(names));
      });
    }
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const input: BudgetInput = {
      name: value.name.trim(),
      amount: toMinorUnits(value.amount ?? 0, this.currency),
      period: value.period,
      categoryIds: value.categoryIds,
      rollover: value.rollover,
      alerts: value.alerts,
    };
    if (this.budget) {
      this.store.update(this.budget, input);
      this.notify.success('Budget updated', input.name);
      this.sheet.close(this.budget.id);
    } else {
      const id = this.store.create(input);
      this.notify.success('Budget added', input.name);
      this.sheet.close(id);
    }
  }

  /**
   * Expense categories as pickers list them, subcategories under their parent,
   * then any archived ones the budget still names, so saving doesn't drop them.
   * Never Balance adjustment, which budgets leave out (BR-12).
   */
  private categoryItemsFor(budget: Budget | undefined) {
    const pickable = this.categories.pickable().expense;
    const kept = (budget?.categoryIds ?? [])
      .map((id) => this.categories.byId(id))
      .filter((c): c is Category => !!c && !pickable.includes(c));
    return [...pickable, ...kept].map((c) => {
      const path = this.categories.path(c);
      return { value: c.id, label: c.archived ? `${path} (archived)` : path };
    });
  }
}
