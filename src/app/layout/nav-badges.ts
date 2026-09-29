import { Injectable, signal } from '@angular/core';

/**
 * Counts the navigation shows beside its items. Features that load after
 * start-up set them, so the shell can show a count without pulling a
 * feature's stores into the initial bundle (NFR-02).
 */
@Injectable({ providedIn: 'root' })
export class NavBadges {
  /** Ask-first recurring entries waiting for Confirm or Skip (REC-04). */
  readonly recurring = signal(0);
}
