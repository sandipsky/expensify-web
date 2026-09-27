import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CATEGORY_TYPES, CategoryType } from '../../../core/models/category';
import { Transaction } from '../../../core/models/transaction';
import { Button } from '../../../shared/components/ui/button/button';
import { Select } from '../../../shared/components/ui/input/select/select';
import { injectSheet } from '../../../shared/services/sheet.service';
import { AccountsStore } from '../../accounts/accounts.store';
import { CategoriesStore } from '../../categories/categories.store';
import { TX_TYPE_LABELS, entries } from '../transaction-labels';

export type BulkEditMode = 'category' | 'account';

export interface BulkEditData {
  mode: BulkEditMode;
  transactions: Transaction[];
}

/**
 * Picks where selected entries go (TXN-13): a category, for the entries of
 * its type, or an account. Closes with the chosen ID; the caller writes it.
 */
@Component({
  selector: 'app-bulk-edit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button, Select],
  template: `
    <div class="sheet-form">
      <h2 class="sheet-form__title">{{ title }}</h2>
      <div class="sheet-form__fields" [formGroup]="form">
        <l-select
          formControlName="target"
          bindValue="value"
          bindLabel="label"
          [label]="mode === 'category' ? 'Category' : 'Account'"
          [placeholder]="mode === 'category' ? 'Choose a category' : 'Choose an account'"
          [items]="items"
          [groupBy]="grouped ? 'group' : undefined"
          [searchable]="items.length > 8"
        />
        @if (note) {
          <p class="sheet-form__hint">{{ note }}</p>
        }
      </div>
      <div class="sheet-form__actions">
        <l-button variant="outlined" size="lg" (click)="sheet.close()">Cancel</l-button>
        <l-button size="lg" [disabled]="!items.length" (click)="apply()">{{ action }}</l-button>
      </div>
    </div>
  `,
  styleUrl: './bulk-edit.scss',
})
export class BulkEdit {
  protected readonly sheet = injectSheet<BulkEditData, string>();
  private readonly accounts = inject(AccountsStore);
  private readonly categories = inject(CategoriesStore);

  protected readonly mode = this.sheet.data!.mode;
  private readonly txs = this.sheet.data!.transactions;
  /** Income and expense entries each take a category of their own type. */
  private readonly types = CATEGORY_TYPES.filter((t) => this.txs.some((tx) => tx.type === t));

  protected readonly title =
    this.mode === 'category'
      ? `Recategorize ${entries(this.txs.length)}`
      : `Move ${entries(this.txs.length)}`;
  protected readonly action = this.mode === 'category' ? 'Recategorize' : 'Move';
  protected readonly grouped = this.mode === 'category' && this.types.length > 1;
  protected readonly items = this.mode === 'category' ? this.categoryItems() : this.accountItems();
  protected readonly note = this.explain();

  protected readonly form = inject(FormBuilder).nonNullable.group({
    target: [null as string | null, Validators.required],
  });

  protected apply(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.sheet.close(this.form.controls.target.value!);
  }

  private categoryItems() {
    return this.types.flatMap((type: CategoryType) =>
      this.categories.pickable()[type].map((c) => ({
        value: c.id,
        label: this.categories.path(c),
        group: TX_TYPE_LABELS[type],
      })),
    );
  }

  private accountItems() {
    return this.accounts.active().map((a) => ({ value: a.id, label: a.name }));
  }

  /** Says up front which entries a change will leave alone. */
  private explain(): string {
    const transfers = this.txs.filter((tx) => tx.type === 'transfer').length;
    if (this.mode === 'account') {
      return transfers
        ? 'Transfers move the account they come from, unless they go into the one you pick.'
        : '';
    }
    if (!this.types.length) return 'Transfers have no category, so there is nothing to change.';
    const notes: string[] = [];
    if (this.types.length > 1)
      notes.push('Expenses take an expense category and income an income one.');
    if (transfers) notes.push('Transfers have no category and stay as they are.');
    return notes.join(' ');
  }
}
