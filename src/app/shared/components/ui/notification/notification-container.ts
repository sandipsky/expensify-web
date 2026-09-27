import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Notification } from './notification';
import { NotificationData, NotificationPosition } from './notification.config';

const POSITIONS: NotificationPosition[] = [
  'top',
  'topLeft',
  'topRight',
  'bottom',
  'bottomLeft',
  'bottomRight',
];

/**
 * Single host rendered into `<body>` by {@link NotificationService}. Holds the
 * live notification list and lays them out into six fixed position regions.
 */
@Component({
  selector: 'l-notification-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Notification],
  template: `
    @for (pos of _positions; track pos) {
      @if (_grouped()[pos].length) {
        <div class="notif-region" [class]="'notif-region--' + pos">
          @for (n of _grouped()[pos]; track n.id) {
            <l-notification
              [type]="n.type"
              [title]="n.title"
              [message]="n.message"
              [position]="n.position"
              [duration]="n.duration"
              [pauseOnHover]="n.pauseOnHover"
              [showProgress]="n.showProgress"
              [showClose]="n.showClose"
              [withIcon]="n.withIcon"
              [action]="n.action"
              [leaving]="n.leaving()"
              (requestDismiss)="dismiss(n.id)"
              (actionClick)="_runAction(n)"
              (closed)="_remove(n.id)"
            />
          }
        </div>
      }
    }
  `,
  styleUrl: './notification-container.scss',
})
export class NotificationContainer {
  protected readonly _positions = POSITIONS;
  private readonly _items = signal<NotificationData[]>([]);

  protected readonly _grouped = computed(() => {
    const groups: Record<NotificationPosition, NotificationData[]> = {
      top: [],
      topLeft: [],
      topRight: [],
      bottom: [],
      bottomLeft: [],
      bottomRight: [],
    };
    for (const item of this._items()) {
      groups[item.position].push(item);
    }
    return groups;
  });

  /** @internal Push a new notification. */
  add(item: NotificationData): void {
    this._items.update((items) => [...items, item]);
  }

  /** @internal Start the leave animation for a notification. */
  dismiss(id: number): void {
    this._items()
      .find((n) => n.id === id)
      ?.leaving.set(true);
  }

  /** @internal Dismiss every open notification. */
  clear(): void {
    this._items().forEach((n) => n.leaving.set(true));
  }

  protected _runAction(item: NotificationData): void {
    // Dismiss first so a second click during the leave animation can't run it twice.
    if (item.leaving()) return;
    this.dismiss(item.id);
    item.action?.handler();
  }

  protected _remove(id: number): void {
    this._items.update((items) => items.filter((n) => n.id !== id));
  }
}
