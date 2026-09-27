import {
  ApplicationRef,
  createComponent,
  EnvironmentInjector,
  inject,
  Injectable,
  Injector,
  TemplateRef,
  Type,
} from '@angular/core';
import { ModalContainer } from './modal-container';
import { ModalRef } from './modal-ref';
import { MODAL_DEFAULTS, ModalConfig } from './modal.config';

/**
 * Material-`MatDialog`-style service for opening modals.
 *
 * Supports both an `<ng-template>` (TemplateRef) and a Component class as content,
 * returns a `ModalRef` handle (close / afterClosed / componentInstance), and plays
 * pure-CSS enter/leave animations selected via `config.animation`.
 */
@Injectable({ providedIn: 'root' })
export class ModalService {
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(Injector);
  private readonly envInjector = inject(EnvironmentInjector);

  private readonly openModals: ModalRef[] = [];

  open<T = any, D = any, R = any>(
    content: Type<T> | TemplateRef<any>,
    config: ModalConfig<D> = {},
  ): ModalRef<T, R> {
    const merged: ModalConfig<D> = { ...MODAL_DEFAULTS, ...config };
    const modalRef = new ModalRef<T, R>(merged);

    const containerRef = createComponent(ModalContainer, {
      environmentInjector: this.envInjector,
    });
    modalRef._containerRef = containerRef;

    const container = containerRef.instance;
    container.content = content;
    container.config = merged;
    container.modalRef = modalRef;
    container.parentInjector = this.injector;

    this.appRef.attachView(containerRef.hostView);
    document.body.appendChild(containerRef.location.nativeElement);

    this.openModals.push(modalRef);
    this.lockBodyScroll();

    modalRef.afterClosed().subscribe(() => this.dispose(modalRef));

    return modalRef;
  }

  /** Close every open modal. */
  closeAll(): void {
    [...this.openModals].forEach((m) => m.close());
  }

  private dispose(modalRef: ModalRef): void {
    const index = this.openModals.indexOf(modalRef);
    if (index === -1) {
      return;
    }
    this.openModals.splice(index, 1);

    const containerRef = modalRef._containerRef;
    if (containerRef) {
      this.appRef.detachView(containerRef.hostView);
      containerRef.destroy();
    }

    if (this.openModals.length === 0) {
      document.body.style.overflow = '';
    }
  }

  private lockBodyScroll(): void {
    document.body.style.overflow = 'hidden';
  }
}
