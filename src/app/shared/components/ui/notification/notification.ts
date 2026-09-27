import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NotificationPosition, NotificationType } from './notification.config';

/**
 * A single notification card (toast). Presentational: it renders the type icon,
 * title/message, optional close button and progress bar, and runs its own
 * dismiss timer off the progress animation (so "pause on hover" and the visible
 * bar share one clock). The owning {@link NotificationContainer} adds/removes it.
 */
@Component({
  selector: 'l-notification',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notification.html',
  styleUrl: './notification.scss',
  host: {
    '[class]': '_hostClasses()',
    '[class.pause]': 'pauseOnHover()',
    '[class.is-leaving]': 'leaving()',
    role: 'alert',
    '(animationend)': '_onAnimationEnd($event)',
  },
})
export class Notification {
  readonly type = input<NotificationType>('info');
  readonly title = input<string>();
  readonly message = input<string>();
  readonly position = input<NotificationPosition>('topRight');
  readonly duration = input<number>(4000);
  readonly pauseOnHover = input(true);
  readonly showProgress = input(true);
  readonly showClose = input(true);
  readonly withIcon = input(true);
  /** When true, the card plays its leave animation and then emits `closed`. */
  readonly leaving = input(false);

  /** Requests dismissal (close clicked or timer elapsed) — the container drives the leave. */
  readonly requestDismiss = output<void>();
  /** Fired once the leave animation has finished and the card can be removed. */
  readonly closed = output<void>();

  protected readonly _hostClasses = computed(
    () => `l-notification l-notification--${this.type()} l-notification--${this.position()}`,
  );

  protected _onProgressEnd(): void {
    this.requestDismiss.emit();
  }

  protected _onAnimationEnd(event: AnimationEvent): void {
    // Only the host's own leave animation should finalize removal.
    if (event.target === event.currentTarget && this.leaving()) {
      this.closed.emit();
    }
  }

  protected _onClose(): void {
    this.requestDismiss.emit();
  }
}
