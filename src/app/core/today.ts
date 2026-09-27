import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { localDate } from './domain/transactions';

/**
 * The user's local date as `YYYY-MM-DD` (BR-06), as a signal the periods,
 * budgets, reports and recurring rules follow. It moves on at midnight and
 * whenever the app comes back into view, so a tab left open overnight, or a
 * laptop that slept through midnight, catches up.
 */
@Injectable({ providedIn: 'root' })
export class Today {
  readonly date = signal(localDate());

  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const refresh = () => this.refresh();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    this.scheduleMidnight();
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      clearTimeout(this.timer);
    });
  }

  private refresh(): void {
    const today = localDate();
    if (today !== this.date()) this.date.set(today);
  }

  /** Wakes just after the next local midnight. Timers can run late, so `refresh` also runs on focus. */
  private scheduleMidnight(): void {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    this.timer = setTimeout(() => {
      this.refresh();
      this.scheduleMidnight();
    }, midnight.getTime() - now.getTime());
  }
}
