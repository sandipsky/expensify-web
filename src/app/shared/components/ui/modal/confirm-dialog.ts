import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { Button } from '../button/button';
import { MODAL_DATA } from './modal.config';
import { ModalRef } from './modal-ref';

let _uid = 0;

export interface ConfirmDialogData {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** Variant of the confirm button — `danger` for destructive actions. */
  confirmVariant?: 'primary' | 'danger';
  /**
   * A word the user must type before the confirm button works, e.g. `DELETE`,
   * for actions that can't be undone. Matched ignoring case and outer spaces.
   */
  confirmPhrase?: string;
  /**
   * Optional async action run when the user confirms. The dialog shows a
   * loading state while it runs and only closes (with `true`) when it
   * succeeds — on error the dialog stays open so the user can retry.
   * If omitted, confirming simply closes with `true`.
   */
  onConfirm?: () => Observable<unknown>;
}

/**
 * Example of opening a *component* (rather than a template) in the modal.
 * Reads its inputs from {@link MODAL_DATA} and closes itself via the injected
 * {@link ModalRef}, returning `true`/`false` through `afterClosed()`.
 */
@Component({
  selector: 'l-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button],
  template: `
    <div class="confirm-dialog">
      <h2 class="confirm-dialog__title">{{ data.title || 'Confirm' }}</h2>
      <p class="confirm-dialog__message">{{ data.message || 'Are you sure?' }}</p>

      @if (data.confirmPhrase) {
        <div class="form-group confirm-dialog__phrase">
          <label [for]="_phraseId">Type {{ data.confirmPhrase }} to confirm</label>
          <input
            class="form-control"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            [id]="_phraseId"
            [disabled]="_loading()"
            (input)="_typed.set($any($event.target).value)"
            (keydown.enter)="confirm()"
          />
        </div>
      }

      <div class="confirm-dialog__actions">
        <l-button variant="outlined" [disabled]="_loading()" (click)="ref.close(false)">
          {{ data.cancelText || 'Cancel' }}
        </l-button>
        <l-button
          [variant]="data.confirmVariant || 'danger'"
          [disabled]="_loading() || !_phraseMatches()"
          (click)="confirm()"
        >
          {{ _loading() ? 'Working…' : data.confirmText || 'Delete' }}
        </l-button>
      </div>
    </div>
  `,
  styleUrl: './confirm-dialog.scss',
})
export class ConfirmDialog {
  readonly ref = inject<ModalRef<ConfirmDialog, boolean>>(ModalRef);
  readonly data = inject<ConfirmDialogData>(MODAL_DATA) ?? {};

  protected readonly _loading = signal(false);
  protected readonly _typed = signal('');
  protected readonly _phraseId = `l-confirm-phrase-${_uid++}`;
  /** True when no phrase is asked for, or the typed text matches it. */
  protected readonly _phraseMatches = computed(
    () =>
      !this.data.confirmPhrase ||
      this._typed().trim().toLowerCase() === this.data.confirmPhrase.trim().toLowerCase(),
  );

  confirm(): void {
    if (this._loading() || !this._phraseMatches()) {
      return;
    }

    // No async action supplied — behave like a plain confirm.
    if (!this.data.onConfirm) {
      this.ref.close(true);
      return;
    }

    // Block the modal from closing until the action resolves.
    this.ref.config.disableClose = true;
    this._loading.set(true);

    this.data.onConfirm().subscribe({
      next: () => {
        this.ref.config.disableClose = false;
        this.ref.close(true);
      },
      error: () => {
        // Keep the dialog open so the user can retry.
        this._loading.set(false);
        this.ref.config.disableClose = false;
      },
    });
  }
}
