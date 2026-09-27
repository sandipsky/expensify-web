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
import { parseISO } from 'date-fns';
import { combineLatest, map, switchMap } from 'rxjs';
import { flipForLiability, isLiability, runningBalances } from '../../../core/domain/account';
import { effects } from '../../../core/domain/balance';
import { Account } from '../../../core/models/account';
import { ADJUSTMENT_CATEGORY_IDS } from '../../../core/models/category';
import { Transaction, TxType } from '../../../core/models/transaction';
import { Preferences } from '../../../core/preferences';
import { BreakpointService } from '../../../layout/breakpoint.service';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { Breadcrumb } from '../../../shared/components/ui/breadcrumb';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { Chip } from '../../../shared/components/ui/chip';
import { Icon, IconName } from '../../../shared/components/ui/icon/icon';
import { Col, Row } from '../../../shared/components/ui/layout';
import { Menu } from '../../../shared/components/ui/menu';
import { Progress } from '../../../shared/components/ui/progress';
import { Skeleton } from '../../../shared/components/ui/skeleton';
import { Table, TableCellDirective, TableColumn } from '../../../shared/components/ui/table';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { AccountActions } from '../account-actions';
import { AccountIcon } from '../account-icon/account-icon';
import { ACCOUNT_TYPE_LABELS, balanceView, utilizationView } from '../account-labels';
import { AccountsStore } from '../accounts.store';

/** All-time lists load 50 entries at a time (§8). */
const PAGE_SIZE = 50;

/** One transaction as the account page shows it. */
export interface ActivityRow {
  id: string;
  date: string;
  dateLabel: string;
  title: string;
  subtitle: string;
  icon: IconName;
  kind: TxType;
  /** Signed change to this account, in minor units. */
  amount: number;
  /** This account's balance right after the transaction; for cards and loans, the amount owed. */
  balance: number;
  pending: boolean;
}

interface ActivityDay {
  date: string;
  label: string;
  rows: ActivityRow[];
}

const CURRENT_CAPTIONS = {
  Balance: 'Current balance',
  Owed: 'Amount owed',
  'In credit': 'In credit',
} as const;

/** `/accounts/:id`: the account's figures and its transactions with a running balance (ACC-06). */
@Component({
  selector: 'app-account-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AccountIcon,
    Breadcrumb,
    Button,
    Card,
    Chip,
    Col,
    EmptyState,
    Icon,
    Menu,
    MoneyPipe,
    Progress,
    Row,
    Skeleton,
    Table,
    TableCellDirective,
  ],
  templateUrl: './account-detail.html',
  styleUrl: './account-detail.scss',
})
export class AccountDetail {
  /** The `:id` route parameter. */
  readonly id = input.required<string>();

  protected readonly store = inject(AccountsStore);
  protected readonly actions = inject(AccountActions);
  protected readonly breakpoints = inject(BreakpointService);
  private readonly router = inject(Router);
  private readonly locale = inject(Preferences).locale;

  protected readonly account = computed(() => this.store.byId(this.id()));
  protected readonly typeLabel = computed(() => {
    const account = this.account();
    return account ? ACCOUNT_TYPE_LABELS[account.type] : '';
  });
  protected readonly current = computed(() => {
    const account = this.account();
    if (!account) return null;
    const view = balanceView(account);
    return { ...view, caption: CURRENT_CAPTIONS[view.caption] };
  });
  protected readonly opening = computed(() => {
    const account = this.account();
    if (!account) return null;
    return {
      caption: isLiability(account.type) ? 'Opening amount owed' : 'Opening balance',
      amount: flipForLiability(account.type, account.openingBalance),
    };
  });
  protected readonly utilization = computed(() => {
    const account = this.account();
    return account ? utilizationView(account) : null;
  });

  /** Cards and loans track what's owed rather than a balance (ACC-08). */
  protected readonly balanceLabel = computed(() => {
    const account = this.account();
    return account && isLiability(account.type) ? 'Owed' : 'Balance';
  });

  protected readonly columns = computed<TableColumn[]>(() => [
    { key: 'dateLabel', header: 'Date', width: '170px' },
    { key: 'title', header: 'Description' },
    { key: 'amount', header: 'Amount', align: 'right', width: '160px' },
    { key: 'balance', header: this.balanceLabel(), align: 'right', width: '160px' },
  ]);

  /** How many transactions to listen to; back to one page when the account changes. */
  private readonly limit = linkedSignal({ source: this.id, computation: () => PAGE_SIZE });

  private readonly page = toSignal(
    combineLatest([toObservable(this.id), toObservable(this.limit)]).pipe(
      switchMap(([id, limit]) =>
        this.store.watchTransactions(id, limit).pipe(map((txs) => ({ limit, txs }))),
      ),
    ),
  );

  protected readonly loadingTransactions = computed(() => this.page() === undefined);
  protected readonly hasMore = computed(() => {
    const page = this.page();
    return !!page && page.txs.length >= page.limit;
  });

  private readonly dateFormat = computed(
    () =>
      new Intl.DateTimeFormat(this.locale(), {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
  );

  protected readonly rows = computed<ActivityRow[]>(() => {
    const page = this.page();
    const account = this.account();
    if (!page || !account) return [];
    let txs = page.txs;
    // The query pages by date only, so with more to load the last day may be cut
    // short and out of time order. Hold it back until the next page brings all of it.
    if (txs.length >= page.limit) {
      const lastDate = txs[txs.length - 1].date;
      const wholeDays = txs.filter((tx) => tx.date !== lastDate);
      if (wholeDays.length) txs = wholeDays;
    }
    const balances = runningBalances(account.currentBalance, account.id, txs);
    return txs.map((tx, i) => this.toRow(tx, account, balances[i]));
  });

  protected readonly days = computed<ActivityDay[]>(() => {
    const days: ActivityDay[] = [];
    for (const row of this.rows()) {
      const last = days[days.length - 1];
      if (last?.date === row.date) last.rows.push(row);
      else days.push({ date: row.date, label: row.dateLabel, rows: [row] });
    }
    return days;
  });

  protected loadMore(): void {
    this.limit.update((limit) => limit + PAGE_SIZE);
  }

  protected async delete(account: Account): Promise<void> {
    if (await this.actions.delete(account)) this.router.navigateByUrl('/accounts');
  }

  protected backToAccounts(): void {
    this.router.navigateByUrl('/accounts');
  }

  private toRow(tx: Transaction, account: Account, balance: number): ActivityRow {
    return {
      id: tx.id,
      date: tx.date,
      dateLabel: this.dateFormat().format(parseISO(tx.date)),
      title: this.describe(tx, account),
      subtitle: [tx.time, tx.note].filter(Boolean).join(' · '),
      icon: iconFor(tx),
      kind: tx.type,
      amount: effects(tx).get(account.id) ?? 0,
      balance: flipForLiability(account.type, balance),
      pending: !!tx.pending,
    };
  }

  /** Payee first; category names arrive with the categories feature, until then the type. */
  private describe(tx: Transaction, account: Account): string {
    if (tx.type === 'transfer') {
      const outgoing = tx.accountId === account.id;
      const otherId = outgoing ? tx.toAccountId : tx.accountId;
      const other = (otherId && this.store.byId(otherId)?.name) || 'another account';
      return outgoing ? `Transfer to ${other}` : `Transfer from ${other}`;
    }
    if (tx.payee) return tx.payee;
    if (tx.categoryId && ADJUSTMENT_CATEGORY_IDS.includes(tx.categoryId)) {
      return 'Balance adjustment';
    }
    return tx.type === 'income' ? 'Income' : 'Expense';
  }
}

/** Direction icons pair with the +/− sign so type never relies on color (NFR-09). */
function iconFor(tx: Transaction): IconName {
  if (tx.type === 'transfer') return 'swap_horiz';
  if (tx.categoryId && ADJUSTMENT_CATEGORY_IDS.includes(tx.categoryId)) return 'tune';
  return tx.type === 'income' ? 'south_west' : 'north_east';
}
