import { Injectable, Type, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BreakpointService } from '../../layout/breakpoint.service';
import { DRAWER_DATA, DrawerRef, DrawerService } from '../components/ui/drawer';
import { MODAL_DATA, ModalRef, ModalService } from '../components/ui/modal';

/**
 * Opens a form the way §10 lays them out: a bottom sheet on phones, a dialog on
 * tablets and desktops. The opened component reads its data and closes itself
 * through `injectSheet()`, which works in either container.
 *
 * ```ts
 * this.sheets.open<string>(AccountForm, { account }).subscribe((id) => …);
 * ```
 */
@Injectable({ providedIn: 'root' })
export class SheetService {
  private readonly modals = inject(ModalService);
  private readonly drawers = inject(DrawerService);
  private readonly breakpoints = inject(BreakpointService);

  /** Emits the result passed to `close()` (or `undefined` when dismissed) once, after closing. */
  open<R = unknown, D = unknown>(
    component: Type<unknown>,
    data?: D,
    options: { width?: string } = {},
  ): Observable<R | undefined> {
    if (this.breakpoints.phone()) {
      return this.drawers
        .open<unknown, D, R>(component, { data, position: 'bottom', size: 'auto' })
        .afterClosed();
    }
    return this.modals
      .open<unknown, D, R>(component, { data, width: options.width ?? '480px' })
      .afterClosed();
  }
}

export interface SheetHandle<D, R> {
  /** What the opener passed, or `null`. */
  readonly data: D | null;
  close(result?: R): void;
}

/** For a component opened by `SheetService`: its data and a `close()` for whichever container holds it. */
export function injectSheet<D = unknown, R = unknown>(): SheetHandle<D, R> {
  const modalRef = inject<ModalRef<unknown, R>>(ModalRef, { optional: true });
  const drawerRef = inject<DrawerRef<unknown, R>>(DrawerRef, { optional: true });
  const data: D | null = modalRef
    ? inject(MODAL_DATA, { optional: true })
    : inject(DRAWER_DATA, { optional: true });
  return {
    data: data ?? null,
    close: (result?: R) => (modalRef ?? drawerRef)?.close(result),
  };
}
