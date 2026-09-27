import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, map } from 'rxjs';
import { OccurrenceOutcome, RecurringChanges, RecurringRepo } from '../../core/data/recurring.repo';
import { TransactionsRepo } from '../../core/data/transactions.repo';
import {
  dueDates,
  firstDueDate,
  isEnded,
  pendingDates,
  rescheduledDueDate,
  resumedDueDate,
} from '../../core/domain/recurrence';
import { compareNewestFirst } from '../../core/domain/transactions';
import { RecurringRule, RecurringRuleInput, Schedule } from '../../core/models/recurring';
import { NewTransaction, Transaction, TxType } from '../../core/models/transaction';
import { Preferences } from '../../core/preferences';
import { Today } from '../../core/today';
import { AccountsStore } from '../accounts/accounts.store';
import { CategoriesStore } from '../categories/categories.store';
import { TX_TYPE_LABELS } from '../transactions/transaction-labels';
import { scheduleLabel } from './recurring-labels';

/**
 * Where a rule stands: running, paused (REC-07), run its course (REC-03), or
 * unable to run because an account it needs was deleted.
 */
export type RuleStatus = 'active' | 'paused' | 'ended' | 'missing_account';

/** A rule as the recurring screens show it. */
export interface RuleView {
  id: string;
  rule: RecurringRule;
  /** The payee, else the category, else "Transfer". */
  name: string;
  /** Material Symbols name and color: the category's, or neutral for transfers. */
  icon: string;
  color: string | null;
  /** "Every month on the 1st". */
  schedule: string;
  /** "Bank", or "Bank → Cash" for a transfer. */
  accountLabel: string;
  kind: TxType;
  /** + for income, − for expense, unsigned for a transfer, in minor units. */
  amount: number;
  status: RuleStatus;
  /** The next date an entry is due, or null once the rule has ended. */
  next: string | null;
  /** Occurrences due by today and not yet created or skipped, oldest first (REC-06). */
  due: string[];
}

/** Order of the fields a schedule edit compares, to decide whether the next date moves. */
const SCHEDULE_FIELDS = ['frequency', 'interval', 'weekdays', 'dayOfMonth', 'startDate'] as const;

/**
 * Recurring rules for the whole app (REC-01 to REC-07): the Recurring pages,
 * the runner that creates due entries, and "Make recurring" in the
 * transaction form share one listener on the rules. Root-provided for that
 * reason.
 */
@Injectable({ providedIn: 'root' })
export class RecurringStore {
  private readonly repo = inject(RecurringRepo);
  private readonly transactions = inject(TransactionsRepo);
  private readonly accounts = inject(AccountsStore);
  private readonly categories = inject(CategoriesStore);
  private readonly locale = inject(Preferences).locale;

  /** Entries are in the base currency until multi-currency (§8). */
  readonly currency = inject(Preferences).baseCurrency;
  readonly today = inject(Today).date;

  private readonly _all = toSignal(this.repo.watchAll());

  /** True until the rules, and the accounts and categories that name them, have loaded. */
  readonly loading = computed(
    () => this._all() === undefined || this.accounts.loading() || this.categories.loading(),
  );

  /** Every rule as shown, soonest next date first; ended rules last. */
  readonly views = computed<RuleView[]>(() =>
    (this._all() ?? [])
      .map((rule) => this.toView(rule))
      .sort(
        (a, b) =>
          (a.next ?? '9999').localeCompare(b.next ?? '9999') || a.name.localeCompare(b.name),
      ),
  );

  /** Running rules, and those waiting for an account to be fixed. */
  readonly active = computed(() =>
    this.views().filter((v) => v.status === 'active' || v.status === 'missing_account'),
  );
  readonly paused = computed(() => this.views().filter((v) => v.status === 'paused'));
  readonly ended = computed(() => this.views().filter((v) => v.status === 'ended'));

  /** Ask-first rules with occurrences waiting for Confirm or Skip (REC-04), oldest due first. */
  readonly waiting = computed(() =>
    this.views()
      .filter((v) => v.rule.mode === 'confirm' && v.status === 'active' && v.due.length)
      .sort((a, b) => a.due[0].localeCompare(b.due[0])),
  );
  /** How many occurrences wait for the user, for the navigation badge. */
  readonly waitingCount = computed(() =>
    this.waiting().reduce((sum, view) => sum + view.due.length, 0),
  );

  byId(id: string): RuleView | undefined {
    return this.views().find((v) => v.id === id);
  }

  /** The next `count` dates the rule will create, from its next due date (REC-02, REC-03). */
  upcoming(rule: RecurringRule, count: number): string[] {
    return rule.active ? pendingDates(rule, count) : [];
  }

  /** The entries the rule created, newest first, `limit` at a time (§8 rule history). */
  watchHistory(ruleId: string, limit: number): Observable<Transaction[]> {
    return this.transactions
      .watchByRule(ruleId, limit)
      .pipe(map((txs) => [...txs].sort(compareNewestFirst)));
  }

  /** Adds a rule and returns its ID; its first due date is the first schedule date from its start. */
  create(input: RecurringRuleInput): string {
    return this.repo.create({
      ...copyInput(input),
      occurrences: 0,
      nextDueDate: firstDueDate(input),
      active: true,
    });
  }

  /**
   * Saves the fields that changed. Edits reach future entries only (REC-07):
   * entries already created stay as they are, and a new schedule counts from
   * today (or from an older date still waiting to be confirmed).
   */
  update(rule: RecurringRule, input: RecurringRuleInput): void {
    const next = copyInput(input);
    const changes: RecurringChanges = {};
    const template: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(next.template)) {
      if (!same(rule.template[key as keyof typeof rule.template], value)) template[key] = value;
    }
    if (Object.keys(template).length) changes.template = template;
    for (const [key, value] of Object.entries(next)) {
      if (key === 'template') continue;
      if (!same(rule[key as keyof RecurringRule], value)) {
        (changes as Record<string, unknown>)[key] = value;
      }
    }
    if (SCHEDULE_FIELDS.some((field) => field in changes)) {
      const nextDueDate = rescheduledDueDate(next, rule.nextDueDate, this.today());
      if (nextDueDate !== rule.nextDueDate) changes.nextDueDate = nextDueDate;
    }
    if (Object.keys(changes).length) this.repo.update(rule.id, changes);
  }

  /**
   * Pausing stops new entries; resuming picks up from today, leaving out the
   * dates that passed while paused (REC-07).
   */
  setActive(rule: RecurringRule, active: boolean): void {
    if (rule.active === active) return;
    const changes: RecurringChanges = { active };
    if (active) {
      const nextDueDate = resumedDueDate(rule, rule.nextDueDate, this.today());
      if (nextDueDate !== rule.nextDueDate) changes.nextDueDate = nextDueDate;
    }
    this.repo.update(rule.id, changes);
  }

  /** Deletes the rule; the entries it already created stay (REC-07). */
  delete(rule: RecurringRule): void {
    this.repo.delete(rule.id);
  }

  /** Undoes a delete. */
  restore(rule: RecurringRule): void {
    this.repo.restore(rule);
  }

  /** Creates the automatic rule's due entries (REC-05, REC-06); resolves to how many this device created. */
  generate(rule: RecurringRule): Promise<number> {
    return this.repo.generate(rule.id, this.today());
  }

  /** Creates the ask-first occurrence due on `date`, as the template has it or as edited (REC-04). */
  confirm(rule: RecurringRule, date: string, entry?: NewTransaction): Promise<OccurrenceOutcome> {
    return this.repo.confirm(rule.id, date, entry);
  }

  /** Passes over the occurrence due on `date` (REC-04). */
  skip(rule: RecurringRule, date: string): Promise<OccurrenceOutcome> {
    return this.repo.skip(rule.id, date);
  }

  /** Undoes a skip: `date` is due again, as long as nothing was handled after it. */
  unskip(rule: RecurringRule, date: string): void {
    this.repo.update(rule.id, { nextDueDate: date });
  }

  private toView(rule: RecurringRule): RuleView {
    const { template } = rule;
    const transfer = template.type === 'transfer';
    const accountIds = transfer ? [template.accountId, template.toAccountId] : [template.accountId];
    const accountsLoaded = !this.accounts.loading();
    const missing = accountsLoaded && accountIds.some((id) => !id || !this.accounts.byId(id));
    const accountName = (id: string | null | undefined) =>
      (id && this.accounts.byId(id)?.name) || 'Deleted account';
    const category = this.categories.byId(template.categoryId);
    const categoryName = transfer
      ? TX_TYPE_LABELS.transfer
      : category
        ? this.categories.path(category)
        : TX_TYPE_LABELS[template.type];
    const ended = isEnded(rule);
    const status: RuleStatus = !rule.active
      ? 'paused'
      : ended
        ? 'ended'
        : missing
          ? 'missing_account'
          : 'active';
    return {
      id: rule.id,
      rule,
      name: template.payee || categoryName,
      icon: transfer ? 'swap_horiz' : (category?.icon ?? 'help'),
      color: transfer ? null : (category?.color ?? null),
      schedule: scheduleLabel(rule, this.locale()),
      accountLabel: transfer
        ? `${accountName(template.accountId)} → ${accountName(template.toAccountId)}`
        : accountName(template.accountId),
      kind: template.type,
      amount: template.type === 'expense' ? -template.amount : template.amount,
      status,
      next: ended ? null : rule.nextDueDate,
      due: status === 'active' ? dueDates(rule, this.today()) : [],
    };
  }
}

/** The input as it's written: trimmed, with the fields other frequencies and ends don't use cleared. */
function copyInput(input: RecurringRuleInput): RecurringRuleInput {
  const transfer = input.template.type === 'transfer';
  const schedule: Schedule = {
    frequency: input.frequency,
    interval: Math.max(1, Math.trunc(input.interval)),
    weekdays: input.frequency === 'weekly' ? [...input.weekdays].sort((a, b) => a - b) : [],
    dayOfMonth: input.frequency === 'monthly' ? input.dayOfMonth : null,
    startDate: input.startDate,
  };
  return {
    template: {
      type: input.template.type,
      amount: input.template.amount,
      accountId: input.template.accountId,
      toAccountId: transfer ? (input.template.toAccountId ?? null) : null,
      categoryId: transfer ? null : (input.template.categoryId ?? null),
      payee: input.template.payee?.trim() || null,
      note: input.template.note?.trim() || null,
      tags: [...input.template.tags],
    },
    ...schedule,
    endType: input.endType,
    endDate: input.endType === 'until' ? input.endDate : null,
    maxCount: input.endType === 'count' ? input.maxCount : null,
    mode: input.mode,
  };
}

function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.join('\n') === b.join('\n');
  return (a ?? null) === (b ?? null);
}
