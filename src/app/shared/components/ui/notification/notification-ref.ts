/** Handle to a shown notification, returned by `NotificationService.show()`. */
export class NotificationRef {
  constructor(
    readonly id: number,
    private readonly _dismiss: () => void,
  ) {}

  /** Begin dismissing this notification (plays the leave animation). */
  dismiss(): void {
    this._dismiss();
  }
}
