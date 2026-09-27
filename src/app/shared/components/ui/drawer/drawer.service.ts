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
import { DrawerContainer } from './drawer-container';
import { DrawerRef } from './drawer-ref';
import { DRAWER_DEFAULTS, DrawerConfig } from './drawer.config';

/**
 * Service for opening edge-anchored drawers (left / right / bottom).
 *
 * Mirrors {@link ModalService}: opens an `<ng-template>` (TemplateRef) or a
 * Component class as content, returns a `DrawerRef` handle (close / afterClosed /
 * componentInstance), and plays pure-CSS slide animations chosen by `position`.
 */
@Injectable({ providedIn: 'root' })
export class DrawerService {
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(Injector);
  private readonly envInjector = inject(EnvironmentInjector);

  private readonly openDrawers: DrawerRef[] = [];

  open<T = any, D = any, R = any>(
    content: Type<T> | TemplateRef<any>,
    config: DrawerConfig<D> = {},
  ): DrawerRef<T, R> {
    const merged: DrawerConfig<D> = { ...DRAWER_DEFAULTS, ...config };
    const drawerRef = new DrawerRef<T, R>(merged);

    const containerRef = createComponent(DrawerContainer, {
      environmentInjector: this.envInjector,
    });
    drawerRef._containerRef = containerRef;

    const container = containerRef.instance;
    container.content = content;
    container.config = merged;
    container.drawerRef = drawerRef;
    container.parentInjector = this.injector;

    this.appRef.attachView(containerRef.hostView);
    document.body.appendChild(containerRef.location.nativeElement);

    this.openDrawers.push(drawerRef);
    this.lockBodyScroll();

    drawerRef.afterClosed().subscribe(() => this.dispose(drawerRef));

    return drawerRef;
  }

  /** Close every open drawer. */
  closeAll(): void {
    [...this.openDrawers].forEach((d) => d.close());
  }

  private dispose(drawerRef: DrawerRef): void {
    const index = this.openDrawers.indexOf(drawerRef);
    if (index === -1) {
      return;
    }
    this.openDrawers.splice(index, 1);

    const containerRef = drawerRef._containerRef;
    if (containerRef) {
      this.appRef.detachView(containerRef.hostView);
      containerRef.destroy();
    }

    if (this.openDrawers.length === 0) {
      document.body.style.overflow = '';
    }
  }

  private lockBodyScroll(): void {
    document.body.style.overflow = 'hidden';
  }
}
