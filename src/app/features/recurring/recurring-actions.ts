import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { OccurrenceOutcome } from '../../core/data/recurring.repo';
import { formatMoney } from '../../core/domain/money';
import { occurrenceOf, scheduleAfter, templateOf } from '../../core/domain/recurrence';
import { RecurringRule } from '../../core/models/recurring';
import { Transaction } from '../../core/models/transaction';
import { Preferences } from '../../core/preferences';
import { NotificationService } from '../../shared/components/ui/notification';
import { SheetService } from '../../shared/services/sheet.service';
import { AccountsStore } from '../accounts/accounts.store';
import {
  TRANSACTION_FORM_OPTIONS,
  TransactionForm,
  TransactionFormData,
  TransactionFormResult,
} from '../transactions/transaction-form/transaction-form';
import { TransactionRows } from '../transactions/transaction-rows';
import { RecurringStore, RuleView } from './recurring.store';
import { RuleForm, RuleFormData } from './rule-form/rule-form';

/** Undo window for single deletes (TXN-07). */
const UNDO_MS = 5000;

/** Tall enough for the entry and its schedule; a near full-height sheet on phones. */
const FORM_OPTIONS = { width: '560px', maxHeight: '760px', phoneHeight: '94dvh' };

/** The recurring screens' user flows: the form, pausing, delete with Undo, Confirm and Skip. */
@Injectable({ providedIn: 'root' })
export class RecurringActions {
  private readonly store = inject(RecurringStore);
  private readonly accounts = inject(AccountsStore);
  private readonly rows = inject(TransactionRows);
  private readonly sheets = inject(SheetService);
  private readonly notify = inject(NotificationService);
  private readonly locale = inject(Preferences).locale;

  /** Opens the add form (REC-01). Emits the new rule's ID, or `undefined` if cancelled. */
  create(): Observable<string | undefined> {
    return this.sheets.open<string, RuleFormData>(RuleForm, {}, FORM_OPTIONS);
  }

  /**
   * "Make recurring" (REC-01): a rule with the entry's fields, repeating
   * monthly from one period after it, so the entry itself isn't made again.
   */
  createFrom(tx: Transaction): Observable<string | undefined> {
    return this.sheets.open<string, RuleFormData>(
      RuleForm,
      {
        prefill: { template: templateOf(tx), ...scheduleAfter(tx.date, 'monthly') },
        fromDate: tx.date,
      },
      FORM_OPTIONS,
    );
  }

  edit(rule: RecurringRule): void {
    this.sheets.open<string, RuleFormData>(RuleForm, { rule }, FORM_OPTIONS);
  }

  /** No new entries while paused; Undo puts it back exactly as it was (REC-07). */
  pause(view: RuleView): void {
    this.store.setActive(view.rule, false);
    this.notify.success('Recurring rule paused', view.name, {
      duration: UNDO_MS,
      action: { label: 'Undo', handler: () => this.store.restore(view.rule) },
    });
  }

  /** Picks up from today; dates that passed while paused are left out (REC-07). */
  resume(view: RuleView): void {
    this.store.setActive(view.rule, true);
    this.notify.success('Recurring rule resumed', view.name);
  }

  /** Deletes at once, with a 5-second Undo. The entries it created stay (REC-07). */
  delete(view: RuleView): void {
    this.store.delete(view.rule);
    this.notify.info('Recurring rule deleted', `${view.name}. Entries it already added stay.`, {
      duration: UNDO_MS,
      action: { label: 'Undo', handler: () => this.store.restore(view.rule) },
    });
  }

  /** Adds the ask-first entry due on `date` as the rule has it (REC-04). */
  async confirm(view: RuleView, date: string): Promise<void> {
    this.report(view, await this.store.confirm(view.rule, date), 'Entry added');
  }

  /** Passes over the entry due on `date`, with Undo (REC-04). */
  async skip(view: RuleView, date: string): Promise<void> {
    const outcome = await this.store.skip(view.rule, date);
    if (outcome !== 'done') {
      this.report(view, outcome, '');
      return;
    }
    this.notify.info('Entry skipped', `${view.name} · ${this.rows.dateLabel(date)}`, {
      duration: UNDO_MS,
      action: { label: 'Undo', handler: () => this.store.unskip(view.rule, date) },
    });
  }

  /** Opens the entry due on `date` in the transaction form, and adds it as edited (REC-04). */
  editAndConfirm(view: RuleView, date: string): void {
    const account = this.accounts.byId(view.rule.template.accountId);
    const prefill = occurrenceOf(
      view.id,
      view.rule.template,
      date,
      account?.currency ?? this.store.currency(),
    );
    this.sheets
      .open<TransactionFormResult, TransactionFormData>(
        TransactionForm,
        { prefill, draft: { title: 'Confirm recurring entry', saveLabel: 'Add entry' } },
        TRANSACTION_FORM_OPTIONS,
      )
      .subscribe(async (result) => {
        if (result?.action !== 'draft') return;
        const outcome = await this.store.confirm(view.rule, date, result.transaction);
        this.report(view, outcome, 'Entry added');
      });
  }

  private report(view: RuleView, outcome: OccurrenceOutcome, done: string): void {
    switch (outcome) {
      case 'done': {
        const kind = view.kind === 'transfer' ? 'auto' : 'exceptZero';
        const amount = formatMoney(view.amount, this.store.currency(), this.locale(), kind);
        this.notify.success(done, `${view.name} · ${amount}`);
        return;
      }
      case 'stale':
        this.notify.info(
          'Already handled',
          'This entry was confirmed or skipped on another device.',
        );
        return;
      case 'missing-account':
        this.notify.warn(
          "Couldn't add the entry",
          'An account it uses was deleted. Edit the rule to pick another one.',
        );
        return;
      case 'failed':
        // WriteErrors has already told the user.
        return;
    }
  }
}
