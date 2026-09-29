import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, map } from 'rxjs';
import { AccountChanges, AccountsRepo } from '../../core/data/accounts.repo';
import { ReceiptsRepo } from '../../core/data/receipts.repo';
import { TransactionsRepo } from '../../core/data/transactions.repo';
import {
  ACCOUNT_TYPE_DEFAULTS,
  Adjustment,
  reconcileAdjustment,
  totalBalance,
} from '../../core/domain/account';
import { attachmentsOf } from '../../core/domain/attachments';
import { compareNewestFirst, localDate, localTime } from '../../core/domain/transactions';
import { Account, AccountInput } from '../../core/models/account';
import { Transaction } from '../../core/models/transaction';
import { Preferences } from '../../core/preferences';

/**
 * Accounts state for the whole app: the accounts screens now, and pickers and the
 * dashboard later, share this one listener. Root-provided for that reason.
 */
@Injectable({ providedIn: 'root' })
export class AccountsStore {
  private readonly repo = inject(AccountsRepo);
  private readonly transactions = inject(TransactionsRepo);
  private readonly receipts = inject(ReceiptsRepo);

  /** New accounts use the base currency until multi-currency (§8). */
  readonly currency = inject(Preferences).baseCurrency;

  private readonly _all = toSignal(this.repo.watchAll());

  /** True until the first snapshot arrives; skeletons show only then. */
  readonly loading = computed(() => this._all() === undefined);
  readonly all = computed(() => this._all() ?? []);
  /** What pickers and the dashboard offer: archived accounts are hidden (ACC-04). */
  readonly active = computed(() => this.all().filter((a) => !a.archived));
  readonly archived = computed(() => this.all().filter((a) => a.archived));
  /** Active accounts marked "include in total" (ACC-02). */
  readonly total = computed(() => totalBalance(this.all()));
  /** How many active accounts the total leaves out. */
  readonly excludedCount = computed(() => this.active().filter((a) => !a.includeInTotal).length);

  byId(id: string): Account | undefined {
    return this.all().find((a) => a.id === id);
  }

  /**
   * Adds the account at the end of the list and returns its ID (ACC-01), in
   * the base currency unless `currency` says otherwise, as onboarding does
   * before its currency choice has come back from the profile.
   */
  create(input: AccountInput, currency = this.currency()): string {
    const { icon, color } = ACCOUNT_TYPE_DEFAULTS[input.type];
    return this.repo.create({
      name: input.name.trim(),
      type: input.type,
      currency,
      openingBalance: input.openingBalance,
      creditLimit: input.type === 'credit_card' ? input.creditLimit : null,
      icon,
      color,
      includeInTotal: input.includeInTotal,
      archived: false,
      sortOrder: Math.max(-1, ...this.all().map((a) => a.sortOrder)) + 1,
    });
  }

  /**
   * Saves the fields that changed (ACC-03). The icon and color follow a new type
   * only while they're still the old type's defaults, so a custom choice made
   * elsewhere, such as on Android, survives.
   */
  update(account: Account, input: AccountInput): void {
    const next: AccountChanges = {
      name: input.name.trim(),
      type: input.type,
      openingBalance: input.openingBalance,
      creditLimit: input.type === 'credit_card' ? input.creditLimit : null,
      includeInTotal: input.includeInTotal,
    };
    if (input.type !== account.type) {
      const before = ACCOUNT_TYPE_DEFAULTS[account.type];
      const after = ACCOUNT_TYPE_DEFAULTS[input.type];
      if (account.icon === before.icon) next.icon = after.icon;
      if (account.color === before.color) next.color = after.color;
    }
    const changes = Object.fromEntries(
      Object.entries(next).filter(([key, value]) => account[key as keyof Account] !== value),
    ) as AccountChanges;
    if (Object.keys(changes).length) this.repo.update(account, changes);
  }

  setArchived(account: Account, archived: boolean): void {
    this.repo.setArchived(account.id, archived);
  }

  /** How many transactions touch the account, which decides how deleting it works (ACC-05). */
  async transactionCount(account: Account): Promise<number> {
    return (await this.transactions.listByAccount(account.id)).length;
  }

  /**
   * Deletes the account and its transactions (ACC-05), and their receipts
   * (ATT-05). They're read again here, so entries added since the user was
   * asked go too.
   */
  async delete(account: Account): Promise<void> {
    const transactions = await this.transactions.listByAccount(account.id);
    this.repo.delete(account.id, transactions);
    this.receipts.delete(attachmentsOf(transactions));
  }

  /** Undoes a delete of an account that had no transactions. */
  restore(account: Account): void {
    this.repo.restore(account);
  }

  /**
   * Records the "Balance adjustment" that brings the account to `actualBalance`,
   * dated now (ACC-07). Returns it, or null when the balance already matches.
   */
  reconcile(account: Account, actualBalance: number): Adjustment | null {
    const adjustment = reconcileAdjustment(account.currentBalance, actualBalance);
    if (!adjustment) return null;
    const now = new Date();
    this.transactions.add({
      ...adjustment,
      currency: account.currency,
      accountId: account.id,
      toAccountId: null,
      date: localDate(now),
      time: localTime(now),
      tags: [],
    });
    return adjustment;
  }

  /** The account's newest `limit` transactions, newest first by date, time and creation (ACC-06). */
  watchTransactions(accountId: string, limit: number): Observable<Transaction[]> {
    return this.transactions
      .watchByAccount(accountId, limit)
      .pipe(map((txs) => [...txs].sort(compareNewestFirst)));
  }
}
