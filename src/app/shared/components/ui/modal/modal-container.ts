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
import { ModalRef } from './modal-ref';
import { MODAL_DATA, ModalAnimation, ModalConfig } from './modal.config';

type ModalState = 'enter' | 'leave';

/**
 * Host component rendered into `<body>` by {@link ModalService}. Owns the
 * backdrop, the centered panel, the pure-CSS enter/leave animations, and
 * renders the supplied content — which may be either a `TemplateRef` or a
 * Component type.
 */
@Component({
  selector: 'l-modal-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: `
    <div
      class="modal-overlay"
      [class.modal-overlay--leaving]="_state() === 'leave'"
      [style.--modal-duration.ms]="config.animationDuration"
    >
      @if (config.backdrop !== false) {
        <div class="modal-backdrop" (click)="_onBackdropClick()"></div>
      }

      <div class="modal-scroll" (click)="_onBackdropClick()">
        <div
          #panel
          class="modal-panel"
          [class]="_panelClasses()"
          [style.width]="config.width"
          [style.height]="config.height"
          [style.maxWidth]="config.maxWidth"
          (click)="$event.stopPropagation()"
          (animationend)="_onAnimationEnd($event)"
        >
          <ng-container #content />
        </div>
      </div>
    </div>
  `,
  styleUrl: './modal-container.scss',
  host: {
    '(document:keydown.escape)': '_onEscape()',
  },
})
export class ModalContainer implements AfterViewInit {
  /** Content to project — a `TemplateRef` or a Component class. Assigned by ModalService. */
  content!: TemplateRef<unknown> | Type<unknown>;
  config!: ModalConfig;
  modalRef!: ModalRef;
  /** Injector of the caller, used as the parent for component content. */
  parentInjector!: Injector;

  protected readonly _state = signal<ModalState>('enter');

  private readonly _contentAnchor = viewChild.required('content', { read: ViewContainerRef });
  private readonly _cdr = inject(ChangeDetectorRef);

  protected readonly _panelClasses = computed(() => {
    const anim = this.config.animation ?? 'slideUp';
    const classes = ['modal-panel', `modal-anim-${anim}`, `modal-anim--${this._state()}`];
    const extra = this.config.panelClass;
    if (extra) {
      classes.push(...(Array.isArray(extra) ? extra : [extra]));
    }
    return classes.join(' ');
  });

  ngAfterViewInit(): void {
    // Let the container drive the leave animation when close() is called.
    this.modalRef._startClose = () => this._startLeave();
    this._renderContent();
    this._cdr.detectChanges();
  }

  protected _onAnimationEnd(event: AnimationEvent): void {
    // Only react to the panel's own animation, and only on the way out.
    if (event.target === event.currentTarget && this._state() === 'leave') {
      this.modalRef._finishClose();
    }
  }

  protected _onBackdropClick(): void {
    if (!this.config.disableClose) {
      this.modalRef.close();
    }
  }

  protected _onEscape(): void {
    if (!this.config.disableClose) {
      this.modalRef.close();
    }
  }

  private _renderContent(): void {
    const anchor = this._contentAnchor();
    if (this.content instanceof TemplateRef) {
      anchor.createEmbeddedView(this.content, {
        $implicit: this.config.data,
        data: this.config.data,
        modalRef: this.modalRef,
      });
    } else {
      const injector = Injector.create({
        parent: this.parentInjector,
        providers: [
          { provide: ModalRef, useValue: this.modalRef },
          { provide: MODAL_DATA, useValue: this.config.data ?? null },
        ],
      });
      const ref = anchor.createComponent(this.content, { injector });
      this.modalRef.componentInstance = ref.instance;
    }
  }

  private _startLeave(): void {
    if (this._state() === 'leave') {
      return;
    }
    this._state.set('leave');
    this._cdr.detectChanges();

    // 'none' has no keyframes, so animationend never fires — finish immediately.
    if ((this.config.animation as ModalAnimation) === 'none') {
      this.modalRef._finishClose();
    }
  }
}
