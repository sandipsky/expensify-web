import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { merge } from 'rxjs';
import {
  DEFAULT_CATEGORY_ICON,
  MAX_CATEGORY_NAME,
  suggestColor,
} from '../../../core/domain/category';
import { Category, CategoryType } from '../../../core/models/category';
import { Button } from '../../../shared/components/ui/button/button';
import { ColorPicker } from '../../../shared/components/ui/input/color-picker/color-picker';
import { IconPicker } from '../../../shared/components/ui/input/icon-picker/icon-picker';
import { RadioOption } from '../../../shared/components/ui/input/input';
import { Select } from '../../../shared/components/ui/input/select/select';
import { TextInput } from '../../../shared/components/ui/input/text-input/text-input';
import { NotificationService } from '../../../shared/components/ui/notification';
import { SegmentedControl } from '../../../shared/components/ui/segmented-control';
import { injectSheet } from '../../../shared/services/sheet.service';
import { CategoriesStore } from '../categories.store';
import {
  CATEGORY_TYPE_LABELS,
  CATEGORY_TYPE_OPTIONS,
  COLOR_OPTIONS,
  ICON_OPTIONS,
} from '../category-labels';

export interface CategoryFormData {
  /** The category to edit; omit to add one. */
  category?: Category;
  /** Adding: the list it goes in. */
  type?: CategoryType;
  /** Adding: make it a subcategory of this one (CAT-07). */
  parentId?: string | null;
}

/** Required that also rejects names made only of spaces. */
function notBlank(control: AbstractControl<string | null>): ValidationErrors | null {
  return (control.value ?? '').trim() ? null : { required: true };
}

/** The options, plus `value` first when it isn't one of them, so a color or icon set elsewhere stays selected. */
function withCurrent(
  options: readonly RadioOption[],
  value: string | undefined,
  label: string,
): RadioOption[] {
  return value && !options.some((o) => o.value === value)
    ? [{ value, label }, ...options]
    : [...options];
}

/**
 * Add or edit a category: name, parent, color and icon (CAT-02, CAT-07). The
 * type is chosen only when adding a top-level category; after that it's fixed,
 * since transactions of that type use it. Names are unique per type and
 * parent, ignoring case (CAT-04).
 */
@Component({
  selector: 'app-category-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    Button,
    ColorPicker,
    IconPicker,
    SegmentedControl,
    Select,
    TextInput,
  ],
  templateUrl: './category-form.html',
  styleUrl: './category-form.scss',
})
export class CategoryForm {
  protected readonly sheet = injectSheet<CategoryFormData, string>();
  private readonly store = inject(CategoriesStore);
  private readonly notify = inject(NotificationService);

  protected readonly category = this.sheet.data?.category;
  /** The parent it's being added under, or its current parent when editing. */
  private readonly parent = this.store.byId(this.category?.parentId ?? this.sheet.data?.parentId);
  private readonly startType =
    this.category?.type ?? this.parent?.type ?? this.sheet.data?.type ?? 'expense';

  protected readonly title = this.category
    ? 'Edit category'
    : this.parent
      ? 'Add subcategory'
      : 'Add category';
  /** A new top-level category picks its type; a subcategory takes its parent's. */
  protected readonly chooseType = !this.category && !this.parent;
  /** Subcategories go one level deep, so one with its own stays at the top level. */
  protected readonly hasSubcategories =
    !!this.category && this.store.subcategories(this.category).length > 0;

  protected readonly typeOptions = CATEGORY_TYPE_OPTIONS;
  protected readonly colorOptions = withCurrent(
    COLOR_OPTIONS,
    this.category?.color,
    'Current color',
  );
  protected readonly iconOptions = withCurrent(
    ICON_OPTIONS,
    this.category?.icon,
    this.category?.icon.replaceAll('_', ' ') ?? '',
  );

  protected readonly form = inject(FormBuilder).nonNullable.group({
    type: [this.startType],
    name: [
      this.category?.name ?? '',
      [
        notBlank,
        Validators.maxLength(MAX_CATEGORY_NAME),
        (control: AbstractControl<string>) => this.uniqueName(control),
      ],
    ],
    parentId: [
      (this.category ? this.category.parentId : (this.parent?.id ?? null)) as string | null,
    ],
    color: [
      this.category?.color ?? this.parent?.color ?? suggestColor(this.store.all(), this.startType),
    ],
    icon: [this.category?.icon ?? this.parent?.icon ?? DEFAULT_CATEGORY_ICON],
  });

  protected readonly type = toSignal(this.form.controls.type.valueChanges, {
    initialValue: this.startType,
  });
  protected readonly color = toSignal(this.form.controls.color.valueChanges, {
    initialValue: this.form.controls.color.value,
  });

  protected readonly parentItems = computed(() =>
    this.store
      .parentOptions(this.type(), this.category)
      .map((c) => ({ value: c.id, label: c.name })),
  );

  protected readonly namePlaceholder = computed(() =>
    this.type() === 'income' ? 'e.g. Side job, Pension' : 'e.g. Coffee, Car repairs',
  );

  constructor() {
    const { type, parentId, name } = this.form.controls;
    // Parents belong to one type, so a new type starts at the top level.
    type.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => parentId.setValue(null));
    // Names are unique per type and parent, so a move checks the name again.
    merge(type.valueChanges, parentId.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => name.updateValueAndValidity());
  }

  protected save(): void {
    // Another tab or device may have added the same name since it was typed.
    this.form.controls.name.updateValueAndValidity();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { type, name, parentId, icon, color } = this.form.getRawValue();
    const input = { name: name.trim(), parentId, icon, color };
    if (this.category) {
      this.store.update(this.category, input);
      this.notify.success('Category updated', input.name);
      this.sheet.close(this.category.id);
    } else {
      const id = this.store.create(type, input);
      this.notify.success(parentId ? 'Subcategory added' : 'Category added', input.name);
      this.sheet.close(id);
    }
  }

  /** CAT-04, with a message that says where the clash is. */
  private uniqueName(control: AbstractControl<string>): ValidationErrors | null {
    const group = control.parent;
    if (!group || !control.value?.trim()) return null;
    const { type, parentId } = group.getRawValue() as {
      type: CategoryType;
      parentId: string | null;
    };
    if (!this.store.isNameTaken(control.value, type, parentId, this.category?.id)) return null;
    const parent = this.store.byId(parentId);
    return {
      nameTaken: parent
        ? `${parent.name} already has a subcategory with this name.`
        : `You already have an ${CATEGORY_TYPE_LABELS[type].toLowerCase()} category with this name.`,
    };
  }
}
