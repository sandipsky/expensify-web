import {
  ApplicationRef,
  ComponentRef,
  EnvironmentInjector,
  Injectable,
  createComponent,
  inject,
  signal,
} from '@angular/core';
import { NotificationContainer } from './notification-container';
import { NotificationRef } from './notification-ref';
import {
  NOTIFICATION_DEFAULTS,
  NotificationData,
  NotificationOptions,
  NotificationType,
} from './notification.config';

/**
 * Imperative toast/notification service, in the spirit of `ModalService`.
 *
 * ```ts
 * private notify = inject(NotificationService);
 * this.notify.success('Saved', 'Your changes are live.');
 * this.notify.show({ type: 'error', title: 'Failed', position: 'bottomRight' });
 * ```
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly _appRef = inject(ApplicationRef);
  private readonly _envInjector = inject(EnvironmentInjector);

  private _containerRef?: ComponentRef<NotificationContainer>;
  private _nextId = 0;

  show(options: NotificationOptions): NotificationRef {
    const merged = { ...NOTIFICATION_DEFAULTS, ...options };
    const id = this._nextId++;
    const data: NotificationData = { ...merged, id, leaving: signal(false) };

    this._container().add(data);

    return new NotificationRef(id, () => this._containerRef?.instance.dismiss(id));
  }

  success(title: string, message?: string, options?: NotificationOptions): NotificationRef {
    return this._showTyped('success', title, message, options);
  }

  error(title: string, message?: string, options?: NotificationOptions): NotificationRef {
    return this._showTyped('error', title, message, options);
  }

  warn(title: string, message?: string, options?: NotificationOptions): NotificationRef {
    return this._showTyped('warn', title, message, options);
  }

  info(title: string, message?: string, options?: NotificationOptions): NotificationRef {
    return this._showTyped('info', title, message, options);
  }

  /** Dismiss every open notification. */
  clear(): void {
    this._containerRef?.instance.clear();
  }

  private _showTyped(
    type: NotificationType,
    title: string,
    message?: string,
    options?: NotificationOptions,
  ): NotificationRef {
    return this.show({ ...options, type, title, message });
  }

  private _container(): NotificationContainer {
    if (!this._containerRef) {
      this._containerRef = createComponent(NotificationContainer, {
        environmentInjector: this._envInjector,
      });
      this._appRef.attachView(this._containerRef.hostView);
      document.body.appendChild(this._containerRef.location.nativeElement);
    }
    return this._containerRef.instance;
  }
}
