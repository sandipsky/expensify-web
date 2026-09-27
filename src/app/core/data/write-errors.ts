import { Injectable, inject } from '@angular/core';
import { NotificationService } from '../../shared/components/ui/notification';

/**
 * Where failed writes end up. The UI never awaits a commit (offline, it only
 * resolves once the server confirms, NFR-03), so the repos hand rejections here.
 * The log carries the error alone, never the document, so no amounts, payees or
 * notes leak into it (NFR-13).
 */
@Injectable({ providedIn: 'root' })
export class WriteErrors {
  private readonly notify = inject(NotificationService);

  report(error: unknown): void {
    console.error('[write failed]', error);
    this.notify.error("Couldn't save your change", 'Please try again.');
  }
}
