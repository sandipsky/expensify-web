import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ImportField, ImportRow, PLANNED_PREFIX } from '../../../../core/domain/csv-import';
import { Preferences } from '../../../../core/preferences';
import { EmptyState } from '../../../../shared/components/empty-state/empty-state';
import { Breadcrumb } from '../../../../shared/components/ui/breadcrumb';
import { Button } from '../../../../shared/components/ui/button/button';
import { Card } from '../../../../shared/components/ui/card/card';
import { Chip } from '../../../../shared/components/ui/chip';
import { FileUpload, UploadFile } from '../../../../shared/components/ui/file-upload';
import { Icon } from '../../../../shared/components/ui/icon/icon';
import { Select } from '../../../../shared/components/ui/input/select/select';
import { Toggle } from '../../../../shared/components/ui/input/toggle/toggle';
import { NotificationService } from '../../../../shared/components/ui/notification';
import { SegmentedControl } from '../../../../shared/components/ui/segmented-control';
import { Step, Stepper } from '../../../../shared/components/ui/stepper';
import { VirtualItem, VirtualList } from '../../../../shared/components/ui/virtual-list';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { AccountActions } from '../../../accounts/account-actions';
import { AccountsStore } from '../../../accounts/accounts.store';
import { CategoriesStore } from '../../../categories/categories.store';
import { SYSTEM_CATEGORY_NAMES } from '../../../transactions/transaction-rows';
import { entries } from '../../../transactions/transaction-labels';
import { ImportStore } from '../import.store';
import {
  AMOUNT_MODE_OPTIONS,
  DATE_ORDER_OPTIONS,
  DECIMAL_OPTIONS,
  FIELD_LABELS,
  FILE_PROBLEMS,
  OPTIONAL_FIELDS,
  errorMessage,
  warningMessage,
} from '../import-labels';

/** One row of the preview. */
interface PreviewRow {
  line: number;
  status: 'ready' | 'duplicate' | 'skipped' | 'error';
  date: string;
  title: string;
  detail: string;
  /** Signed minor units for the money pipe; null for rows with errors. */
  amount: number | null;
  currency: string;
  kind: 'income' | 'expense' | 'transfer' | null;
}

/** Fixed height of a preview row for the virtual list; the SCSS keeps to it. */
const ROW_HEIGHT = 60;

const STEPS: readonly Step[] = [
  { title: 'File' },
  { title: 'Columns' },
  { title: 'Review' },
  { title: 'Done' },
];

/**
 * `/settings/import` (DAT-02, §13 Import): pick a CSV, match its columns to
 * fields (an Expensify export maps itself), check every row with its errors
 * and the entries it would duplicate, then import in one go.
 */
@Component({
  selector: 'app-import-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    Breadcrumb,
    Button,
    Card,
    Chip,
    EmptyState,
    FileUpload,
    Icon,
    MoneyPipe,
    SegmentedControl,
    Select,
    Stepper,
    Toggle,
    VirtualItem,
    VirtualList,
  ],
  providers: [ImportStore],
  templateUrl: './import-page.html',
  styleUrl: './import-page.scss',
})
export class ImportPage {
  protected readonly store = inject(ImportStore);
  protected readonly accounts = inject(AccountsStore);
  private readonly accountActions = inject(AccountActions);
  private readonly categories = inject(CategoriesStore);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);
  protected readonly currency = inject(Preferences).baseCurrency;

  protected readonly steps = STEPS;
  protected readonly fieldLabels = FIELD_LABELS;
  protected readonly optionalFields = OPTIONAL_FIELDS;
  protected readonly dateOrders = DATE_ORDER_OPTIONS;
  protected readonly decimals = DECIMAL_OPTIONS;
  protected readonly amountModes = AMOUNT_MODE_OPTIONS;
  protected readonly rowHeight = ROW_HEIGHT;
  protected readonly rowKey = (row: PreviewRow) => row.line;

  protected readonly accountItems = computed(() =>
    this.accounts.active().map((a) => ({ value: a.id, label: a.name })),
  );

  /** Planned categories by key, for naming rows before they exist. */
  private readonly plannedNames = computed(
    () => new Map(this.store.plan().newCategories.map((c) => [c.key, c.name])),
  );

  protected readonly preview = computed<PreviewRow[]>(() => {
    const skip = this.store.skipDuplicates();
    return this.store.rows().map((row) => this.previewRow(row, skip));
  });

  /** Rows that can't be imported, with why, for the list above the preview. */
  protected readonly problems = computed(() =>
    this.store
      .rows()
      .filter((row) => !row.tx)
      .map((row) => ({ line: row.line, message: row.errors.map(errorMessage).join(' ') })),
  );
  protected readonly warnings = computed(() =>
    this.store
      .rows()
      .filter((row) => row.tx && row.warnings.length)
      .map((row) => ({ line: row.line, message: row.warnings.map(warningMessage).join(' ') })),
  );

  protected readonly newCategoryNames = computed(() =>
    this.store.newCategories().map((c) => c.name),
  );

  protected readonly gapMessage = computed(() => {
    const names = this.store
      .gaps()
      .map((gap) => (gap === 'account' ? 'an account' : `the ${gap} column`));
    return names.length ? `Choose ${names.join(' and ')} to go on.` : '';
  });

  protected async pick(files: UploadFile[]): Promise<void> {
    const file = files[0]?.file;
    if (!file) return;
    const problem = await this.store.load(file, file.name);
    if (problem) this.notify.error("Couldn't use that file", FILE_PROBLEMS[problem]);
  }

  protected rejected(): void {
    this.notify.warn('Pick a CSV file', 'Save the sheet as CSV (comma-separated) first.');
  }

  protected column(field: ImportField): number | null {
    return this.store.mapping().columns[field] ?? null;
  }

  protected setColumn(field: ImportField, value: unknown): void {
    this.store.setColumn(field, typeof value === 'number' ? value : null);
  }

  protected setOption(key: 'dateOrder' | 'decimalSeparator' | 'amountMode', value: unknown): void {
    if (value) this.store.update({ [key]: value });
  }

  protected setAccount(value: unknown): void {
    this.store.update({ accountId: typeof value === 'string' ? value : null });
  }

  protected addAccount(): void {
    this.accountActions.create().subscribe();
  }

  protected import(): void {
    const { count, categories } = this.store.import();
    this.notify.success(
      `Imported ${entries(count)}`,
      categories ? `${categories} new ${categories === 1 ? 'category' : 'categories'}` : undefined,
    );
  }

  protected viewImported(): void {
    const range = this.store.result()?.range;
    void this.router.navigate(['/transactions'], {
      queryParams: range ? { from: range.start, to: range.end } : {},
    });
  }

  private previewRow(row: ImportRow, skipDuplicates: boolean): PreviewRow {
    const tx = row.tx;
    const status = !tx
      ? 'error'
      : row.duplicate
        ? skipDuplicates
          ? 'skipped'
          : 'duplicate'
        : 'ready';
    if (!tx) {
      return {
        line: row.line,
        status,
        date: '',
        title: `Line ${row.line}`,
        detail: row.errors.map(errorMessage).join(' '),
        amount: null,
        currency: this.currency(),
        kind: null,
      };
    }
    const account = this.accounts.byId(tx.accountId)?.name ?? '';
    const where =
      tx.type === 'transfer'
        ? `${account} → ${this.accounts.byId(tx.toAccountId ?? '')?.name ?? ''}`
        : account;
    return {
      line: row.line,
      status,
      date: tx.date,
      title: tx.payee || this.categoryName(tx.categoryId) || 'Transfer',
      detail: [tx.type === 'transfer' ? 'Transfer' : this.categoryName(tx.categoryId), where]
        .filter(Boolean)
        .join(' · '),
      amount: tx.type === 'expense' ? -tx.amount : tx.amount,
      currency: tx.currency,
      kind: tx.type,
    };
  }

  private categoryName(id: string | null | undefined): string {
    if (!id) return '';
    if (id.startsWith(PLANNED_PREFIX)) return `${this.plannedNames().get(id) ?? ''} (new)`;
    const category = this.categories.byId(id);
    return category ? this.categories.path(category) : (SYSTEM_CATEGORY_NAMES[id] ?? '');
  }
}
