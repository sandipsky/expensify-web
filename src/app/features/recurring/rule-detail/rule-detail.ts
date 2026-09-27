import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { switchMap } from 'rxjs';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { SymbolIcon } from '../../../shared/components/symbol-icon/symbol-icon';
import { Breadcrumb } from '../../../shared/components/ui/breadcrumb';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { Chip } from '../../../shared/components/ui/chip';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { Menu } from '../../../shared/components/ui/menu';
import { Skeleton } from '../../../shared/components/ui/skeleton';
import { CategoriesStore } from '../../categories/categories.store';
import { TransactionActions } from '../../transactions/transaction-actions';
import { TransactionAmount } from '../../transactions/transaction-amount/transaction-amount';
import { TransactionRow } from '../../transactions/transaction-row/transaction-row';
import { TransactionRows, TxRow, withDate } from '../../transactions/transaction-rows';
import { RecurringActions } from '../recurring-actions';
import { endLabel, entryCount } from '../recurring-labels';
import { RecurringStore, RuleView } from '../recurring.store';

/** How many history entries load at a time (§8: all-time views page by 50). */
const PAGE_SIZE = 50;
/** How many upcoming dates the schedule card lists. */
const UPCOMING = 5;

/**
 * `/recurring/:id`: the rule's entry and schedule, its next dates (REC-02,
 * REC-03), an entry waiting to be confirmed (REC-04), and the entries it has
 * created, newest first (§8 rule history).
 */
@Component({
  selector: 'app-rule-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Breadcrumb,
    Button,
    Card,
    Chip,
    EmptyState,
    Icon,
    Menu,
    Skeleton,
    SymbolIcon,
    TransactionAmount,
    TransactionRow,
  ],
  templateUrl: './rule-detail.html',
  styleUrl: './rule-detail.scss',
})
export class RuleDetail {
  /** The `:id` route parameter. */
  readonly id = input.required<string>();

  protected readonly store = inject(RecurringStore);
  protected readonly actions = inject(RecurringActions);
  private readonly transactions = inject(TransactionActions);
  private readonly txRows = inject(TransactionRows);
  private readonly categories = inject(CategoriesStore);
  private readonly router = inject(Router);

  protected readonly view = computed(() => this.store.byId(this.id()));

  protected readonly categoryLabel = computed(() => {
    const view = this.view();
    const category = this.categories.byId(view?.rule.template.categoryId);
    if (!view || view.kind === 'transfer') return '';
    return category ? this.categories.path(category) : 'Deleted category';
  });
  protected readonly startLabel = computed(() => {
    const view = this.view();
    return view ? this.txRows.dateLabel(view.rule.startDate) : '';
  });
  protected readonly endText = computed(() => {
    const view = this.view();
    return view ? endLabel(view.rule, (d) => this.txRows.dateLabel(d)) || 'Never' : '';
  });
  protected readonly createdText = computed(() => entryCount(this.view()?.rule.occurrences ?? 0));
  protected readonly upcoming = computed(() => {
    const view = this.view();
    if (!view || view.status !== 'active') return [];
    return this.store.upcoming(view.rule, UPCOMING).map((date) => ({
      date,
      label: this.txRows.dateLabel(date),
      due: date <= this.store.today(),
    }));
  });

  /** How many history entries to listen to; one page again for another rule. */
  private readonly limit = linkedSignal({ source: this.id, computation: () => PAGE_SIZE });
  private readonly history = toSignal(
    toObservable(computed(() => ({ id: this.id(), limit: this.limit() }))).pipe(
      switchMap(({ id, limit }) => this.store.watchHistory(id, limit)),
    ),
  );
  protected readonly historyLoading = computed(() => this.history() === undefined);
  /** Every entry is the same payee and category, so each row leads with its date. */
  protected readonly historyRows = computed(() => {
    const today = this.store.today();
    return (this.history() ?? []).map((tx) => withDate(this.txRows.toRow(tx, today)));
  });
  protected readonly hasMore = computed(() => (this.history()?.length ?? 0) >= this.limit());

  protected showMore(): void {
    this.limit.update((limit) => limit + PAGE_SIZE);
  }

  protected openTransaction(row: TxRow): void {
    this.transactions.edit(row.tx).subscribe();
  }

  protected delete(view: RuleView): void {
    this.actions.delete(view);
    void this.router.navigateByUrl('/recurring');
  }

  protected back(): void {
    void this.router.navigateByUrl('/recurring');
  }
}
