import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { TransactionsRepo } from '../../core/data/transactions.repo';
import { dailyReminderDue, msUntilTime } from '../../core/domain/reminders';
import { Preferences } from '../../core/preferences';
import { Today } from '../../core/today';
import { NOTIFICATION_KEYS, readState, writeState } from './device-state';
import { Notifier } from './notifier';

/** Timers may fire a little early; waking just after the minute keeps the check true. */
const TIMER_SLACK_MS = 1000;

/**
 * The daily reminder to log expenses (NTF-01), for users who switched it on:
 * at their reminder time, if nothing is logged for today, once a day. The web
 * app can only do this while it's open, so an app opened later that day shows
 * it then. The v1.1 dailyReminder Function pushes it to a closed app (§12).
 * Entries a recurring rule created don't count as logging. Started once, from
 * the app config.
 */
@Injectable({ providedIn: 'root' })
export class DailyReminder {
  private readonly prefs = inject(Preferences);
  private readonly today = inject(Today).date;
  private readonly notifier = inject(Notifier);
  private readonly transactions = inject(TransactionsRepo);

  /** Today's entries: a one-day query, so the reminder costs almost no reads (NFR-19). */
  private readonly todays = toSignal(
    toObservable(this.today).pipe(
      switchMap((day) => this.transactions.watchRange({ start: day, end: day })),
    ),
  );

  /** Bumped at the reminder time and when the app comes back into view, to check again. */
  private readonly wake = signal(0);

  constructor() {
    // Wake at today's reminder time; re-armed when the time, the switch or the day changes.
    effect((onCleanup) => {
      const { dailyReminder, reminderTime } = this.prefs.notifications();
      this.today();
      if (!dailyReminder) return;
      const ms = msUntilTime(reminderTime, new Date());
      if (ms <= 0) return;
      const timer = setTimeout(() => this.wake.update((n) => n + 1), ms + TIMER_SLACK_MS);
      onCleanup(() => clearTimeout(timer));
    });

    // A timer can run late while the device sleeps, so coming back also checks.
    const check = () => this.wake.update((n) => n + 1);
    document.addEventListener('visibilitychange', check);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('visibilitychange', check));

    effect(() => {
      this.wake();
      const { dailyReminder, reminderTime } = this.prefs.notifications();
      const today = this.today();
      const entries = this.todays();
      if (entries === undefined) return;
      const due = dailyReminderDue({
        enabled: dailyReminder,
        time: reminderTime,
        now: new Date(),
        today,
        loggedToday: entries.some((tx) => tx.source !== 'recurring'),
        lastShown: readState<string | null>(NOTIFICATION_KEYS.dailyReminder, null),
      });
      if (due) untracked(() => this.remind(today));
    });
  }

  private remind(today: string): void {
    writeState(NOTIFICATION_KEYS.dailyReminder, today);
    this.notifier.deliver({
      id: `reminder|${today}`,
      kind: 'reminder',
      tone: 'info',
      title: 'Time to log today’s spending',
      message: 'Nothing is logged for today yet. Adding it takes a few seconds.',
      link: '/transactions/new',
      actionLabel: 'Add',
    });
  }
}
