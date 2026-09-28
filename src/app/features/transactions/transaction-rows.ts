import { Injectable, computed, inject } from '@angular/core';
import { addDays, format, parseISO } from 'date-fns';
import { isAdjustment, isUpcoming } from '../../core/domain/transactions';
import { SYSTEM_CATEGORY_IDS } from '../../core/models/category';
import { Transaction, TxType } from '../../core/models/transaction';
import { Preferences } from '../../core/preferences';
import { AccountsStore } from '../accounts/accounts.store';
import { CategoriesStore } from '../categories/categories.store';
import { TX_TYPE_LABELS } from './transaction-labels';

/** One transaction as lists show it. */
export interface TxRow {
  id: string;
  tx: Transaction;
  date: string;
  /** "Sat, 26 Sep 2026". */
  dateLabel: string;
  /** Payee, else the category, else the type. */
  title: string;
  /** What the title leaves out: category, account, time, tags, note. */
  subtitle: string;
  /** "Food and dining › Coffee"; "Transfer" for transfers. */
  categoryLabel: string;
  /** "Cash", or "Bank → Cash" for a transfer. */
  accountLabel: string;
  /** Material Symbols name: the category's, or one for transfers and adjustments. */
  icon: string;
  /** The category's color; null draws the icon in neutral gray. */
  color: string | null;
  kind: TxType;
  /** + for income, − for expense, unsigned for a transfer, in minor units. */
  amount: number;
  /** Future-dated (TXN-14). */
  upcoming: boolean;
  /** Written but not yet confirmed by the server (SYN-04). */
  pending: boolean;
  /** How many receipts it has (ATT-01). */
  receipts: number;
}

/** Names for system categories that may be referenced before categories are seeded. */
export const SYSTEM_CATEGORY_NAMES: Readonly<Record<string, string>> = {
  [SYSTEM_CATEGORY_IDS.expense.uncategorized]: 'Uncategorized',
  [SYSTEM_CATEGORY_IDS.income.uncategorized]: 'Uncategorized',
  [SYSTEM_CATEGORY_IDS.expense.adjustment]: 'Balance adjustment',
  [SYSTEM_CATEGORY_IDS.income.adjustment]: 'Balance adjustment',
};

/** Turns transactions into the rows the list, the table and later the dashboard draw. */
@Injectable({ providedIn: 'root' })
export class TransactionRows {
  private readonly accounts = inject(AccountsStore);
  private readonly categories = inject(CategoriesStore);
  private readonly locale = inject(Preferences).locale;

  private readonly dateFormat = computed(
    () =>
      new Intl.DateTimeFormat(this.locale(), {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
  );

  /** "Sat, 26 Sep 2026". */
  dateLabel(date: string): string {
    return this.dateFormat().format(parseISO(date));
  }

  /** A day header: "Today", "Yesterday" or "Tomorrow" before the date when it's one of those. */
  dayLabel(date: string, today: string): string {
    const near = {
      [today]: 'Today',
      [format(addDays(parseISO(today), -1), 'yyyy-MM-dd')]: 'Yesterday',
      [format(addDays(parseISO(today), 1), 'yyyy-MM-dd')]: 'Tomorrow',
    }[date];
    return near ? `${near} · ${this.dateLabel(date)}` : this.dateLabel(date);
  }

  toRow(tx: Transaction, today: string): TxRow {
    const account = this.accountName(tx.accountId);
    const category = this.category(tx);
    const transfer = tx.type === 'transfer';
    const accountLabel = transfer ? `${account} → ${this.accountName(tx.toAccountId)}` : account;
    const categoryLabel = transfer ? TX_TYPE_LABELS.transfer : category.name;
    const tags = tx.tags.map((tag) => `#${tag}`).join(' ');
    return {
      id: tx.id,
      tx,
      date: tx.date,
      dateLabel: this.dateLabel(tx.date),
      title: tx.payee || categoryLabel,
      subtitle: [tx.payee ? categoryLabel : null, accountLabel, tx.time, tags, tx.note]
        .filter(Boolean)
        .join(' · '),
      categoryLabel,
      accountLabel,
      icon: transfer ? 'swap_horiz' : category.icon,
      color: transfer ? null : category.color,
      kind: tx.type,
      amount: tx.type === 'expense' ? -tx.amount : tx.amount,
      upcoming: isUpcoming(tx, today),
      pending: !!tx.pending,
      receipts: tx.attachments?.length ?? 0,
    };
  }

  private accountName(id: string | null | undefined): string {
    return (id && this.accounts.byId(id)?.name) || 'Deleted account';
  }

  /** Archived categories still name their entries (CAT-03). */
  private category(tx: Transaction): { name: string; icon: string; color: string | null } {
    const category = this.categories.byId(tx.categoryId);
    if (category) {
      return { name: this.categories.path(category), icon: category.icon, color: category.color };
    }
    const name = (tx.categoryId && SYSTEM_CATEGORY_NAMES[tx.categoryId]) || TX_TYPE_LABELS[tx.type];
    return { name, icon: isAdjustment(tx) ? 'tune' : 'help', color: null };
  }
}

/** The row with its date leading the subtitle, for lists that aren't grouped by day. */
export function withDate(row: TxRow): TxRow {
  return { ...row, subtitle: row.subtitle ? `${row.dateLabel} · ${row.subtitle}` : row.dateLabel };
}
