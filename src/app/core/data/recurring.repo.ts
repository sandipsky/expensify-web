import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { combineEffects, effects } from '../domain/balance';
import {
  CATCH_UP_LIMIT,
  dueDates,
  nextAfter,
  occurrenceId,
  occurrenceOf,
} from '../domain/recurrence';
import { accountIdsOf } from '../domain/transactions';
import {
  END_TYPES,
  FREQUENCIES,
  NewRecurringRule,
  RULE_MODES,
  RecurringRule,
  RecurringTemplate,
} from '../models/recurring';
import { NewTransaction } from '../models/transaction';
import {
  LocalBatch,
  LocalDb,
  LocalDoc,
  LocalTransaction,
  increment,
  serverTimestamp,
} from './local-db';
import { WriteErrors } from './write-errors';

/** Fields an edit may change. Template fields are written one by one (SYN-03). */
export type RecurringChanges = Partial<
  Pick<
    RecurringRule,
    | 'frequency'
    | 'interval'
    | 'weekdays'
    | 'dayOfMonth'
    | 'startDate'
    | 'endType'
    | 'endDate'
    | 'maxCount'
    | 'nextDueDate'
    | 'mode'
    | 'active'
  >
> & { template?: Partial<RecurringTemplate> };

/**
 * What confirming or skipping an occurrence did: `done`, `stale` when another
 * device (or the server job) already handled that date, `missing-account` when
 * an account the entry needs was deleted, `failed` when the write failed.
 */
export type OccurrenceOutcome = 'done' | 'stale' | 'missing-account' | 'failed';

/**
 * `users/{uid}/recurringRules` (§8, v1.1). Occurrences are written in a
 * transaction that reads the rule, checks each occurrence's fixed ID
 * `{ruleId}_{YYYYMMDD}` and advances `nextDueDate` together with the entries
 * and their balance increments (§12 generateRecurring), so a date is created
 * exactly once however many devices try at the same time (REC-05). Firestore
 * transactions need a connection, so offline the dates simply wait.
 */
@Injectable({ providedIn: 'root' })
export class RecurringRepo {
  private readonly db = inject(LocalDb);
  private readonly errors = inject(WriteErrors);
  private readonly path = `${this.db.userPath}/recurringRules`;

  /** Every rule, paused ones too. A handful at most, so one listener serves the app. */
  watchAll(): Observable<RecurringRule[]> {
    return this.db.watch(this.path).pipe(map((docs) => docs.map(toRule)));
  }

  /** Rules whose entries use the category, to move them off it before it's deleted (CAT-06). */
  async listByCategory(categoryId: string): Promise<RecurringRule[]> {
    const docs = await this.db.get(this.path, {
      where: [['template.categoryId', '==', categoryId]],
    });
    return docs.map(toRule);
  }

  /** Writes a new rule and returns its ID. */
  create(rule: NewRecurringRule): string {
    const id = this.db.newId();
    this.commit(
      this.db.batch().set(this.doc(id), {
        ...rule,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    return id;
  }

  /**
   * Writes only the fields passed, template fields as `template.amount` and so
   * on, so another device's edits to other fields survive (SYN-03).
   */
  update(id: string, changes: RecurringChanges): void {
    const { template, ...fields } = changes;
    const data: Record<string, unknown> = { ...fields, updatedAt: serverTimestamp() };
    for (const [field, value] of Object.entries(template ?? {})) data[`template.${field}`] = value;
    this.commit(this.db.batch().update(this.doc(id), data));
  }

  /** Deletes the rule; the entries it created stay, since they really happened. */
  delete(id: string): void {
    this.commit(this.db.batch().delete(this.doc(id)));
  }

  /** Puts back a rule deleted moments ago (Undo), under its old ID with its old fields. */
  restore(rule: RecurringRule): void {
    const { id, pending: _pending, ...fields } = rule;
    this.commit(this.db.batch().set(this.doc(id), { ...fields, updatedAt: serverTimestamp() }));
  }

  /**
   * Creates every occurrence of an automatic rule due by `today`, including
   * missed ones (REC-06), in transactions of up to {@link CATCH_UP_LIMIT}.
   * Resolves to how many entries this call created: none when another device
   * got there first or an account the entries need was deleted. Never rejects.
   */
  async generate(ruleId: string, today: string): Promise<number> {
    let created = 0;
    try {
      for (;;) {
        const run = await this.db.runTransaction(async (tx) => {
          const rule = await this.readRule(tx, ruleId);
          if (!rule || rule.mode !== 'auto') return { handled: 0, created: 0 };
          const dates = dueDates(rule, today, CATCH_UP_LIMIT);
          return this.createOccurrences(tx, rule, dates);
        });
        created += run.created;
        if (run.handled < CATCH_UP_LIMIT) return created;
      }
    } catch (error) {
      this.errors.report(error);
      return created;
    }
  }

  /**
   * Creates an ask-first rule's occurrence on `date` (REC-04), as the template
   * has it or as the user edited it (`entry`). Occurrences are handled oldest
   * first, so `date` must be the rule's next due date.
   */
  confirm(ruleId: string, date: string, entry?: NewTransaction): Promise<OccurrenceOutcome> {
    return this.handleNext(ruleId, date, async (tx, rule) => {
      const result = await this.createOccurrences(tx, rule, [date], entry);
      return result.handled ? 'done' : 'missing-account';
    });
  }

  /** Moves an ask-first rule past `date` without creating anything (REC-04). */
  skip(ruleId: string, date: string): Promise<OccurrenceOutcome> {
    return this.handleNext(ruleId, date, async (tx, rule) => {
      tx.update(this.doc(rule.id), {
        nextDueDate: nextAfter(rule, date),
        updatedAt: serverTimestamp(),
      });
      return 'done';
    });
  }

  private async handleNext(
    ruleId: string,
    date: string,
    handle: (tx: LocalTransaction, rule: RecurringRule) => Promise<OccurrenceOutcome>,
  ): Promise<OccurrenceOutcome> {
    try {
      return await this.db.runTransaction(async (tx) => {
        const rule = await this.readRule(tx, ruleId);
        if (!rule || !rule.active || rule.nextDueDate !== date) return 'stale';
        return handle(tx, rule);
      });
    } catch (error) {
      this.errors.report(error);
      return 'failed';
    }
  }

  /**
   * Writes the occurrences on `dates` that don't exist yet, their balance
   * increments, and the rule's new count and next due date, all in `tx`. An
   * occurrence that already exists counts as handled without being written
   * again. Writes nothing when an account the entries need is missing.
   */
  private async createOccurrences(
    tx: LocalTransaction,
    rule: RecurringRule,
    dates: readonly string[],
    entry?: NewTransaction,
  ): Promise<{ handled: number; created: number }> {
    if (!dates.length) return { handled: 0, created: 0 };
    const source = entry ?? rule.template;
    const accountIds = accountIdsOf(source);
    const accounts = await Promise.all(accountIds.map((id) => tx.get(this.accountDoc(id))));
    if (accounts.some((account) => !account)) return { handled: 0, created: 0 };
    const currency = (accounts[0]!.data['currency'] as string | undefined) ?? 'USD';

    const paths = dates.map(
      (date) => `${this.db.userPath}/transactions/${occurrenceId(rule.id, date)}`,
    );
    const existing = await Promise.all(paths.map((path) => tx.get(path)));
    const deltas: Map<string, number>[] = [];
    dates.forEach((date, i) => {
      if (existing[i]) return;
      const occurrence = entry
        ? { ...entry, recurringRuleId: rule.id }
        : occurrenceOf(rule.id, rule.template, date, currency);
      tx.set(paths[i], {
        ...occurrence,
        accountIds: accountIdsOf(occurrence),
        source: 'recurring',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      deltas.push(effects(occurrence));
    });
    for (const [accountId, delta] of combineEffects(deltas)) {
      if (delta !== 0) {
        tx.update(this.accountDoc(accountId), {
          currentBalance: increment(delta),
          updatedAt: serverTimestamp(),
        });
      }
    }
    tx.update(this.doc(rule.id), {
      occurrences: rule.occurrences + dates.length,
      nextDueDate: nextAfter(rule, dates[dates.length - 1]),
      updatedAt: serverTimestamp(),
    });
    return { handled: dates.length, created: deltas.length };
  }

  private async readRule(tx: LocalTransaction, id: string): Promise<RecurringRule | null> {
    const doc = await tx.get(this.doc(id));
    return doc ? toRule(doc) : null;
  }

  private doc(id: string): string {
    return `${this.path}/${id}`;
  }

  private accountDoc(id: string): string {
    return `${this.db.userPath}/accounts/${id}`;
  }

  // Not awaited: offline, a commit resolves only once the server confirms (§10).
  private commit(batch: LocalBatch): void {
    batch.commit().catch((error) => this.errors.report(error));
  }
}

/**
 * Fills the fields an older or Android-written document may lack. An unknown
 * frequency reads as monthly, and an unknown mode as ask-first, so a value
 * from a newer app never makes this one create money on its own.
 */
function toRule(doc: LocalDoc): RecurringRule {
  const data = doc.data as Partial<RecurringRule>;
  const template = (data.template ?? {}) as Partial<RecurringTemplate>;
  return {
    ...data,
    id: doc.id,
    template: {
      ...template,
      type: template.type ?? 'expense',
      amount: template.amount ?? 0,
      accountId: template.accountId ?? '',
      toAccountId: template.toAccountId ?? null,
      categoryId: template.categoryId ?? null,
      payee: template.payee ?? null,
      note: template.note ?? null,
      tags: template.tags ?? [],
    },
    frequency: data.frequency && FREQUENCIES.includes(data.frequency) ? data.frequency : 'monthly',
    interval: data.interval ?? 1,
    weekdays: data.weekdays ?? [],
    dayOfMonth: data.dayOfMonth ?? null,
    startDate: data.startDate ?? '',
    endType: data.endType && END_TYPES.includes(data.endType) ? data.endType : 'never',
    endDate: data.endDate ?? null,
    maxCount: data.maxCount ?? null,
    occurrences: data.occurrences ?? 0,
    nextDueDate: data.nextDueDate ?? data.startDate ?? '',
    mode: data.mode && RULE_MODES.includes(data.mode) ? data.mode : 'confirm',
    active: data.active ?? true,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    pending: false,
  } as RecurringRule;
}
