import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { LoadingSpinner } from './shared/components/ui/loading-spinner/loading-spinner';

/** After this long without the session settling, say so instead of showing a bare spinner. */
const SLOW_START_MS = 8000;

/**
 * The root: the router's outlet, the one blocking spinner (SpinnerService),
 * and a start-up screen that covers the page until the session is known
 * (AUTH-05), since the guards can't send anyone anywhere before that.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, LoadingSpinner],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly auth = inject(AuthService);
  /** True once start-up has taken long enough to suggest a connection problem. */
  protected readonly slow = signal(false);

  constructor() {
    const timer = setTimeout(() => this.slow.set(true), SLOW_START_MS);
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }
}
