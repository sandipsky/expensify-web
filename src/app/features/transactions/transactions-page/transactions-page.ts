import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { format, parseISO } from 'date-fns';
import { firstValueFrom } from 'rxjs';
import { formatMoney } from '../../../core/domain/money';
import { PeriodPreset, formatPeriod, orderedRange } from '../../../core/domain/period';
import { NO_FILTER, TransactionFilter } from '../../../core/domain/transactions';
import { TX_TYPES, TxType } from '../../../core/models/transaction';
import { Preferences } from '../../../core/preferences';
import { BreakpointService } from '../../../layout/breakpoint.service';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { SymbolIcon } from '../../../shared/components/symbol-icon/symbol-icon';
import { Breadcrumb } from '../../../shared/components/ui/breadcrumb';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { Chip } from '../../../shared/components/ui/chip';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { Checkbox } from '../../../shared/components/ui/input/checkbox/checkbox';
import { DateInput } from '../../../shared/components/ui/input/date-input/date-input';
import { Select } from '../../../shared/components/ui/input/select/select';
import { TextInput } from '../../../shared/components/ui/input/text-input/text-input';
import { NotificationService } from '../../../shared/components/ui/notification';
import { SegmentedControl } from '../../../shared/components/ui/segmented-control';
import { Skeleton } from '../../../shared/components/ui/skeleton';
import {
  Table,
  TableCellDirective,
  TableColumn,
  TableGroupDirective,
} from '../../../shared/components/ui/table';
import { VirtualItem, VirtualList } from '../../../shared/components/ui/virtual-list';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { SheetService } from '../../../shared/services/sheet.service';
import { AccountsStore } from '../../accounts/accounts.store';
import { CategoriesStore } from '../../categories/categories.store';
import { TransactionActions } from '../transaction-actions';
import { TransactionAmount } from '../transaction-amount/transaction-amount';
import {
  TransactionFilters,
  TransactionFiltersData,
} from '../transaction-filters/transaction-filters';
import { PERIOD_OPTIONS, TX_TYPE_LABELS } from '../transaction-labels';
import { TransactionListStore, TxDay } from '../transaction-list.store';
import { TransactionRow } from '../transaction-row/transaction-row';
import { TxRow } from '../transaction-rows';
import { TransactionsStore } from '../transactions.store';

/** One entry of the phone and tablet list: a day header or a transaction. */
type ListItem = { kind: 'day'; day: TxDay } | { kind: 'row'; row: TxRow };

/** Fixed heights the virtual list lays out with; the SCSS keeps to them. */
const DAY_HEIGHT = 40;
const ROW_HEIGHT = 64;

/** A removable chip for one active filter. */
interface FilterChip {
  key: string;
  label: string;
  remove: () => void;
}

/**
 * `/transactions`: the period's entries newest first, grouped by day with each
 * day's net (LST-01); period, type, account, category, tag and amount filters
 * that combine (LST-02, LST-07); search (LST-06); totals of what's shown
 * (LST-03); bulk actions (TXN-13). Phones and tablets get day-grouped rows,
 * desktops a sortable table; both render only the rows in view (LST-04).
 * `/transactions/new` and `/transactions/:id` open the form over the list.
 */
@Component({
  selector: 'app-transactions-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    Breadcrumb,
    Button,
    Card,
    Checkbox,
    Chip,
    DateInput,
    EmptyState,
    Icon,
    MoneyPipe,
    SegmentedControl,
    Select,
    Skeleton,
    SymbolIcon,
    Table,
    TableCellDirective,
    TableGroupDirective,
    TextInput,
    TransactionAmount,
    TransactionRow,
    VirtualItem,
    VirtualList,
  ],
  providers: [TransactionListStore],
  templateUrl: './transactions-page.html',
  styleUrl: './transactions-page.scss',
})
export class TransactionsPage {
  /** `/transactions/:id`: the entry to open. */
  readonly id = input<string>();
  /** `/transactions/new` (route data): open quick add. */
  readonly quickAdd = input(false);

  // Drill-downs from reports and budgets (RPT-04), as query parameters:
  // `?from=2026-09-01&to=2026-09-30&type=expense&category=exp_food,exp_transport&account=…&q=…`.
  readonly from = input<string>();
  readonly to = input<string>();
  readonly type = input<string>();
  /** Comma-separated category IDs; a parent brings its subcategories. */
  readonly category = input<string>();
  readonly account = input<string>();
  /** Search text, such as a payee. */
  readonly q = input<string>();

  protected readonly list = inject(TransactionListStore);
  protected readonly actions = inject(TransactionActions);
  protected readonly breakpoints = inject(BreakpointService);
  private readonly store = inject(TransactionsStore);
  private readonly accounts = inject(AccountsStore);
  private readonly categories = inject(CategoriesStore);
  private readonly sheets = inject(SheetService);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly locale = inject(Preferences).locale;

  protected readonly currency = this.store.currency;
  protected readonly periodOptions = PERIOD_OPTIONS;

  protected readonly periodLabel = computed(() => formatPeriod(this.list.range(), this.locale()));
  protected readonly customStart = computed(() => parseISO(this.list.custom().start));
  protected readonly customEnd = computed(() => parseISO(this.list.custom().end));

  /** Day headers and rows in one list, for the virtual list. */
  protected readonly items = computed<ListItem[]>(() =>
    this.list
      .days()
      .flatMap((day) => [
        { kind: 'day' as const, day },
        ...day.rows.map((row) => ({ kind: 'row' as const, row })),
      ]),
  );
  protected readonly itemSize = (item: ListItem) => (item.kind === 'day' ? DAY_HEIGHT : ROW_HEIGHT);
  protected readonly itemKey = (item: ListItem) =>
    item.kind === 'day' ? `day:${item.day.date}` : item.row.id;
  protected readonly rowHeight = 44;
  protected readonly isSelected = (row: TxRow) => this.list.isSelected(row.id);

  protected readonly columns = computed<TableColumn[]>(() => [
    ...(this.list.selecting() ? [{ key: 'select', header: '', width: '48px' }] : []),
    { key: 'date', header: 'Date', sortable: true, width: '150px' },
    { key: 'title', header: 'Description', sortable: true },
    { key: 'categoryLabel', header: 'Category', sortable: true, width: '22%' },
    { key: 'accountLabel', header: 'Account', sortable: true, width: '18%' },
    { key: 'amount', header: 'Amount', sortable: true, align: 'right', width: '150px' },
  ]);

  private readonly netByDate = computed(
    () => new Map(this.list.days().map((day) => [day.date, day])),
  );

  protected readonly chips = computed<FilterChip[]>(() => {
    const filter = this.list.filter();
    const set = (changes: Partial<TransactionFilter>) =>
      this.list.setFilter({ ...filter, ...changes });
    const chips: FilterChip[] = [];
    if (filter.type) {
      chips.push({
        key: 'type',
        label: TX_TYPE_LABELS[filter.type],
        remove: () => set({ type: null }),
      });
    }
    for (const id of filter.accountIds) {
      chips.push({
        key: `account:${id}`,
        label: this.accounts.byId(id)?.name ?? 'Deleted account',
        remove: () => set({ accountIds: filter.accountIds.filter((a) => a !== id) }),
      });
    }
    for (const id of filter.categoryIds) {
      const category = this.categories.byId(id);
      chips.push({
        key: `category:${id}`,
        label: category ? this.categories.path(category) : 'Deleted category',
        remove: () => set({ categoryIds: filter.categoryIds.filter((c) => c !== id) }),
      });
    }
    for (const tag of filter.tags) {
      chips.push({
        key: `tag:${tag}`,
        label: `#${tag}`,
        remove: () => set({ tags: filter.tags.filter((t) => t !== tag) }),
      });
    }
    const amounts = this.amountLabel(filter);
    if (amounts) {
      chips.push({
        key: 'amount',
        label: amounts,
        remove: () => set({ minAmount: null, maxAmount: null }),
      });
    }
    return chips;
  });

  constructor() {
    // The deep links open the form over the list, then leave the URL on the list.
    effect(() => {
      const id = this.id();
      const quickAdd = this.quickAdd();
      untracked(() => {
        if (quickAdd) this.actions.create().subscribe(() => this.backToList());
        else if (id) this.openById(id);
      });
    });

    // A drill-down sets the period and filters once, then leaves the URL on the plain list.
    effect(() => {
      const drill = {
        from: this.from(),
        to: this.to(),
        type: this.type(),
        category: this.category(),
        account: this.account(),
        q: this.q(),
      };
      if (!Object.values(drill).some(Boolean)) return;
      untracked(() => {
        this.applyDrillDown(drill);
        this.backToList();
      });
    });
  }

  protected setPreset(value: unknown): void {
    if (PERIOD_OPTIONS.some((o) => o.value === value)) this.list.setPreset(value as PeriodPreset);
  }

  protected setCustomDate(edge: 'start' | 'end', date: Date | null): void {
    if (!date) return;
    const custom = { ...this.list.custom(), [edge]: format(date, 'yyyy-MM-dd') };
    this.list.setCustom(orderedRange(custom.start, custom.end));
  }

  protected openFilters(): void {
    this.sheets
      .open<TransactionFilter, TransactionFiltersData>(TransactionFilters, {
        filter: this.list.filter(),
        tags: this.list.periodTags(),
        currency: this.currency(),
      })
      .subscribe((filter) => {
        if (filter) this.list.setFilter(filter);
      });
  }

  protected add(): void {
    this.actions.create().subscribe();
  }

  /** A tap opens the entry, or selects it while selecting. */
  protected open(row: TxRow): void {
    if (this.list.selecting()) this.list.toggle(row.id);
    else this.actions.edit(row.tx).subscribe();
  }

  protected async bulk(action: 'delete' | 'recategorize' | 'move'): Promise<void> {
    const selected = this.list.selected();
    const done =
      action === 'delete'
        ? await this.actions.deleteMany(selected)
        : action === 'recategorize'
          ? await this.actions.recategorize(selected)
          : await this.actions.move(selected);
    if (done) this.list.stopSelecting();
  }

  protected dayOf(date: unknown): TxDay | undefined {
    return this.netByDate().get(date as string);
  }

  private amountLabel(filter: TransactionFilter): string {
    const money = (minor: number) => formatMoney(minor, this.currency(), this.locale());
    const { minAmount: min, maxAmount: max } = filter;
    if (min !== null && max !== null) return `${money(min)} – ${money(max)}`;
    if (min !== null) return `From ${money(min)}`;
    if (max !== null) return `Up to ${money(max)}`;
    return '';
  }

  private applyDrillDown(drill: Record<string, string | undefined>): void {
    const date = /^\d{4}-\d{2}-\d{2}$/;
    const { from, to, type, category, account, q } = drill;
    if (from && to && date.test(from) && date.test(to)) {
      this.list.showRange(orderedRange(from, to));
    }
    this.list.setFilter({
      ...NO_FILTER,
      type: TX_TYPES.includes(type as TxType) ? (type as TxType) : null,
      categoryIds: category ? category.split(',').filter(Boolean) : [],
      accountIds: account ? [account] : [],
    });
    this.list.setSearch(q ?? '');
  }

  private async openById(id: string): Promise<void> {
    const tx = await firstValueFrom(this.store.watch(id));
    if (!tx) {
      this.notify.warn(
        'Transaction not found',
        'It may have been deleted, perhaps on another device.',
      );
      this.backToList();
      return;
    }
    this.actions.edit(tx).subscribe(() => this.backToList());
  }

  private backToList(): void {
    this.router.navigate(['/transactions'], { replaceUrl: true });
  }
}
