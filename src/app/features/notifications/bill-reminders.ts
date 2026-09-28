import { Injectable, effect, inject, untracked } from '@angular/core';
import { addDays, format, parseISO } from 'date-fns';
import { formatMoney } from '../../core/domain/money';
import { BillReminder, billReminder, billReminderKey } from '../../core/domain/reminders';
import { Preferences } from '../../core/preferences';
import { RecurringStore, RuleView } from '../recurring/recurring.store';
import { NOTIFICATION_KEYS, readState, writeState } from './device-state';
import { Notifier } from './notifier';

/** Reminders already shown are remembered this long after their date, then forgotten. */
const KEEP_DAYS = 60;

/**
 * Reminders for ask-first recurring entries (NTF-03): the day before one is
 * due, and once it's due and waiting for Confirm or Skip (REC-04), each once,
 * unless the user turned them off (NTF-04). The web app shows them while it's
 * open; the v1.1 generateRecurring Function pushes them (§12). Started once,
 * from the app config.
 */
@Injectable({ providedIn: 'root' })
export class BillReminders {
  private readonly store = inject(RecurringStore);
  private readonly prefs = inject(Preferences);
  private readonly notifier = inject(Notifier);

  constructor() {
    effect(() => {
      if (!this.prefs.notifications().billReminders || this.store.loading()) return;
      const today = this.store.today();
      const reminders: [RuleView, BillReminder][] = [];
      for (const view of this.store.views()) {
        if (view.status !== 'active') continue;
        const reminder = billReminder(view.rule, today);
        if (reminder) reminders.push([view, reminder]);
      }
      if (reminders.length) untracked(() => this.send(reminders, today));
    });
  }

  private send(reminders: readonly [RuleView, BillReminder][], today: string): void {
    const sent = readState<string[]>(NOTIFICATION_KEYS.billReminders, []);
    const shown = new Set(Array.isArray(sent) ? sent : []);
    let changed = false;
    for (const [view, reminder] of reminders) {
      const key = billReminderKey(reminder);
      if (shown.has(key)) continue;
      shown.add(key);
      changed = true;
      this.remind(view, reminder, today, key);
    }
    if (!changed) return;
    const oldest = format(addDays(parseISO(today), -KEEP_DAYS), 'yyyy-MM-dd');
    writeState(
      NOTIFICATION_KEYS.billReminders,
      [...shown].filter((key) => key.slice(-10) >= oldest),
    );
  }

  private remind(view: RuleView, reminder: BillReminder, today: string, key: string): void {
    const locale = this.prefs.locale();
    const amount = formatMoney(
      view.amount,
      this.store.currency(),
      locale,
      view.kind === 'transfer' ? 'auto' : 'exceptZero',
    );
    const { title, message } = reminderText(
      view.name,
      amount,
      view.accountLabel,
      reminder,
      today,
      locale,
    );
    this.notifier.deliver({
      id: `bill|${key}`,
      kind: 'bill',
      tone: 'info',
      title,
      message,
      link: '/recurring',
      actionLabel: 'Review',
    });
  }
}

/** "Rent is due tomorrow" · "−Rs 20,000.00 · Bank. You'll be asked to confirm it." */
export function reminderText(
  name: string,
  amount: string,
  account: string,
  reminder: BillReminder,
  today: string,
  locale: string,
): { title: string; message: string } {
  if (reminder.kind === 'upcoming') {
    return {
      title: `${name} is due tomorrow`,
      message: `${amount} · ${account}. You’ll be asked to confirm it.`,
    };
  }
  if (reminder.count > 1) {
    return {
      title: `${name}: ${reminder.count} entries waiting`,
      message: `${amount} each · ${account}. Confirm or skip them.`,
    };
  }
  if (reminder.date === today) {
    return {
      title: `${name} is due today`,
      message: `${amount} · ${account}. Confirm or skip it.`,
    };
  }
  const since = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
    parseISO(reminder.date),
  );
  return {
    title: `${name} is waiting`,
    message: `Due ${since} · ${amount}. Confirm or skip it.`,
  };
}
