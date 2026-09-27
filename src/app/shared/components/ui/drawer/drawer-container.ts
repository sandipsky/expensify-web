import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Injector,
  TemplateRef,
  Type,
  ViewContainerRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DrawerRef } from './drawer-ref';
import { DRAWER_DATA, DrawerConfig } from './drawer.config';

type DrawerState = 'enter' | 'leave';

/**
 * Host component rendered into `<body>` by {@link DrawerService}. Owns the
 * backdrop, the edge-anchored panel, the position-driven slide animations,
 * and renders the supplied content — either a `TemplateRef` or a Component type.
 */
@Component({
  selector: 'l-drawer-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: `
    <div
      class="drawer-overlay"
      [class.drawer-overlay--leaving]="_state() === 'leave'"
      [style.--drawer-duration.ms]="config.animationDuration"
    >
      @if (config.backdrop !== false) {
        <div class="drawer-backdrop" (click)="_onBackdropClick()"></div>
      }

      <div
        class="drawer-panel"
        [class]="_panelClasses()"
        [style.width]="_isHorizontal() ? config.size : null"
        [style.height]="!_isHorizontal() ? config.size : null"
        role="dialog"
        aria-modal="true"
        (animationend)="_onAnimationEnd($event)"
      >
        <ng-container #content />
      </div>
    </div>
  `,
  styleUrl: './drawer-container.scss',
  host: {
    '(document:keydown.escape)': '_onEscape()',
  },
})
export class DrawerContainer implements AfterViewInit {
  /** Content to project — a `TemplateRef` or a Component class. Assigned by DrawerService. */
  content!: TemplateRef<unknown> | Type<unknown>;
  config!: DrawerConfig;
  drawerRef!: DrawerRef;
  /** Injector of the caller, used as the parent for component content. */
  parentInjector!: Injector;

  protected readonly _state = signal<DrawerState>('enter');

  private readonly _contentAnchor = viewChild.required('content', { read: ViewContainerRef });
  private readonly _cdr = inject(ChangeDetectorRef);

  protected readonly _isHorizontal = computed(() => {
    const pos = this.config.position ?? 'right';
    return pos === 'left' || pos === 'right';
  });

  protected readonly _panelClasses = computed(() => {
    const pos = this.config.position ?? 'right';
    const classes = ['drawer-panel', `drawer-panel--${pos}`, `drawer-anim--${this._state()}`];
    const extra = this.config.panelClass;
    if (extra) {
      classes.push(...(Array.isArray(extra) ? extra : [extra]));
    }
    return classes.join(' ');
  });

  ngAfterViewInit(): void {
    // Let the container drive the leave animation when close() is called.
    this.drawerRef._startClose = () => this._startLeave();
    this._renderContent();
    this._cdr.detectChanges();
  }

  protected _onAnimationEnd(event: AnimationEvent): void {
    // Only react to the panel's own animation, and only on the way out.
    if (event.target === event.currentTarget && this._state() === 'leave') {
      this.drawerRef._finishClose();
    }
  }

  protected _onBackdropClick(): void {
    if (!this.config.disableClose) {
      this.drawerRef.close();
    }
  }

  protected _onEscape(): void {
    if (!this.config.disableClose) {
      this.drawerRef.close();
    }
  }

  private _renderContent(): void {
    const anchor = this._contentAnchor();
    if (this.content instanceof TemplateRef) {
      anchor.createEmbeddedView(this.content, {
        $implicit: this.config.data,
        data: this.config.data,
        drawerRef: this.drawerRef,
      });
    } else {
      const injector = Injector.create({
        parent: this.parentInjector,
        providers: [
          { provide: DrawerRef, useValue: this.drawerRef },
          { provide: DRAWER_DATA, useValue: this.config.data ?? null },
        ],
      });
      const ref = anchor.createComponent(this.content, { injector });
      this.drawerRef.componentInstance = ref.instance;
    }
  }

  private _startLeave(): void {
    if (this._state() === 'leave') {
      return;
    }
    this._state.set('leave');
    this._cdr.detectChanges();
  }
}
