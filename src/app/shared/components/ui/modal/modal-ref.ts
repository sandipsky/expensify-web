import { ComponentRef } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { ModalConfig } from './modal.config';

/**
 * Handle to an opened modal, returned by `ModalService.open()`.
 * Analogous to Angular Material's `MatDialogRef`.
 */
export class ModalRef<T = any, R = any> {
  /** The instance of the component opened inside the modal (null when a TemplateRef was used). */
  componentInstance: T | null = null;

  /** @internal Set by ModalService — the container's ComponentRef, used for teardown. */
  _containerRef?: ComponentRef<any>;

  /** @internal Set by the container — kicks off the leave animation. */
  _startClose: () => void = () => this._finishClose();

  private readonly _afterClosed = new Subject<R | undefined>();
  private _result?: R;
  private _closing = false;

  constructor(public readonly config: ModalConfig) {}

  /** Begin closing the modal. The result is emitted from `afterClosed()` once the leave animation finishes. */
  close(result?: R): void {
    if (this._closing) {
      return;
    }
    this._closing = true;
    this._result = result;
    this._startClose();
  }

  /** @internal Called by the container once the leave animation has completed. */
  _finishClose(): void {
    this._afterClosed.next(this._result);
    this._afterClosed.complete();
  }

  /** Emits the result once and completes when the modal has fully closed. */
  afterClosed(): Observable<R | undefined> {
    return this._afterClosed.asObservable();
  }
}
