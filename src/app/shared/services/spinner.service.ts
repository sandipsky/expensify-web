import { Injectable, computed, signal } from '@angular/core';

/**
 * Drives the global {@link LoadingSpinner} overlay. Inject it anywhere and call
 * `show()`/`hide()` around async work. Calls are reference-counted, so
 * overlapping operations keep the overlay up until the last one finishes:
 *
 * ```ts
 * this._spinner.show();
 * try {
 *   await loadData();
 * } finally {
 *   this._spinner.hide();
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class SpinnerService {
  private readonly _pending = signal(0);

  /** True while at least one caller is showing the spinner. */
  readonly visible = computed(() => this._pending() > 0);

  /** Show the overlay (increments the pending count). */
  show(): void {
    this._pending.update((count) => count + 1);
  }

  /** Hide one pending request; the overlay stays up until all are cleared. */
  hide(): void {
    this._pending.update((count) => Math.max(0, count - 1));
  }

  /** Force the overlay off regardless of pending count. */
  reset(): void {
    this._pending.set(0);
  }
}
