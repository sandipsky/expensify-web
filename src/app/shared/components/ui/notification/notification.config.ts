import { WritableSignal } from '@angular/core';

export type NotificationType = 'success' | 'warn' | 'error' | 'info';

export type NotificationPosition =
  'top' | 'topLeft' | 'topRight' | 'bottom' | 'bottomLeft' | 'bottomRight';

/** A button on the toast, such as Undo. Pressing it runs `handler` and dismisses the toast. */
export interface NotificationAction {
  label: string;
  handler: () => void;
}

/** Options accepted by `NotificationService.show()` and the type shortcuts. */
export interface NotificationOptions {
  type?: NotificationType;
  title?: string;
  message?: string;
  /** Auto-dismiss delay in ms. `0` keeps it open until dismissed manually. */
  duration?: number;
  position?: NotificationPosition;
  /** Pause the dismiss timer (and progress bar) while hovered. */
  pauseOnHover?: boolean;
  /** Render the shrinking progress bar that tracks the dismiss timer. */
  showProgress?: boolean;
  /** Render the × close button. */
  showClose?: boolean;
  /** Render the leading type icon. */
  withIcon?: boolean;
  /** Render an action button (e.g. Undo) between the text and the close button. */
  action?: NotificationAction;
}

export const NOTIFICATION_DEFAULTS: Required<
  Omit<NotificationOptions, 'title' | 'message' | 'action'>
> = {
  type: 'info',
  duration: 4000,
  position: 'topRight',
  pauseOnHover: true,
  showProgress: true,
  showClose: true,
  withIcon: true,
};

/** Internal record for one live notification, held by the container. */
export interface NotificationData extends Required<
  Omit<NotificationOptions, 'title' | 'message' | 'action'>
> {
  id: number;
  title?: string;
  message?: string;
  action?: NotificationAction;
  /** Drives the leave animation; set true to dismiss. */
  leaving: WritableSignal<boolean>;
}
