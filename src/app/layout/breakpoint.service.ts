import { Injectable, Signal, computed, signal } from '@angular/core';

/**
 * The shell's three layouts from §10 as signals: phone under 600px, tablet
 * 600–1023px, desktop from 1024px. Built on `matchMedia` because the app doesn't
 * use the CDK; `GridBreakpoints` (Bootstrap widths) only drives `l-col`.
 */
@Injectable({ providedIn: 'root' })
export class BreakpointService {
  readonly phone = watch('(max-width: 599.98px)');
  readonly desktop = watch('(min-width: 1024px)');
  readonly tablet = computed(() => !this.phone() && !this.desktop());
}

function watch(query: string): Signal<boolean> {
  // jsdom and very old browsers lack matchMedia: fall back to the tablet layout.
  const list = typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
  const matches = signal(list?.matches ?? false);
  list?.addEventListener('change', (event) => matches.set(event.matches));
  return matches.asReadonly();
}
