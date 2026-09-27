import {
  ComponentRef,
  DestroyRef,
  Directive,
  ElementRef,
  Renderer2,
  ViewContainerRef,
  booleanAttribute,
  inject,
  input,
  numberAttribute,
} from '@angular/core';
import { Tooltip, TooltipSide } from './tooltip';

/** Ant-style placement names: a side plus optional start/end alignment. */
export type TooltipPlacement =
  | 'top'
  | 'topLeft'
  | 'topRight'
  | 'bottom'
  | 'bottomLeft'
  | 'bottomRight'
  | 'left'
  | 'leftTop'
  | 'leftBottom'
  | 'right'
  | 'rightTop'
  | 'rightBottom';

export type TooltipTrigger = 'hover' | 'focus' | 'click';

type Align = 'start' | 'center' | 'end';

const PLACEMENTS: Record<TooltipPlacement, { side: TooltipSide; align: Align }> = {
  top: { side: 'top', align: 'center' },
  topLeft: { side: 'top', align: 'start' },
  topRight: { side: 'top', align: 'end' },
  bottom: { side: 'bottom', align: 'center' },
  bottomLeft: { side: 'bottom', align: 'start' },
  bottomRight: { side: 'bottom', align: 'end' },
  left: { side: 'left', align: 'center' },
  leftTop: { side: 'left', align: 'start' },
  leftBottom: { side: 'left', align: 'end' },
  right: { side: 'right', align: 'center' },
  rightTop: { side: 'right', align: 'start' },
  rightBottom: { side: 'right', align: 'end' },
};

let _uid = 0;

const _clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max));

/**
 * Attaches an Ant-style tooltip to the host element. Shows on hover + keyboard
 * focus by default; switch with `lTooltipTrigger`. The bubble renders in a fixed
 * layer appended to `<body>`, so it escapes any ancestor `overflow` clipping,
 * flips to the opposite side when it would overflow the viewport, and stays
 * anchored while the page scrolls.
 *
 * ```html
 * <button [lTooltip]="'Delete'" lTooltipPlacement="top">🗑</button>
 * <span [lTooltip]="'Copied to clipboard'" lTooltipTrigger="click">Copy</span>
 * ```
 */
@Directive({
  selector: '[lTooltip]',
  host: {
    '(mouseenter)': '_onEnter()',
    '(mouseleave)': '_onLeave()',
    '(focusin)': '_onFocus()',
    '(focusout)': '_onBlur()',
    '(click)': '_onClick()',
    '(keydown.escape)': '_onEscape()',
    '[attr.aria-describedby]': '_visible ? _id : null',
  },
})
export class TooltipDirective {
  /** The tooltip text. An empty string disables the tooltip. */
  readonly lTooltip = input<string>('');
  readonly lTooltipPlacement = input<TooltipPlacement>('top');
  readonly lTooltipTrigger = input<TooltipTrigger>('hover');
  readonly lTooltipDisabled = input(false, { transform: booleanAttribute });
  readonly lTooltipArrow = input(true, { transform: booleanAttribute });
  /** Any CSS color/token for the bubble background (e.g. `var(--error)`). */
  readonly lTooltipColor = input<string>('');
  readonly lTooltipMaxWidth = input<number | null>(null, { transform: numberAttribute });
  /** Delay before showing, in ms. */
  readonly lTooltipOpenDelay = input(120, { transform: numberAttribute });
  /** Delay before hiding, in ms. */
  readonly lTooltipCloseDelay = input(80, { transform: numberAttribute });

  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _vcr = inject(ViewContainerRef);
  private readonly _renderer = inject(Renderer2);

  protected readonly _id = `l-tooltip-${_uid++}`;
  protected _visible = false;
  private _ref: ComponentRef<Tooltip> | null = null;
  private _openTimer: ReturnType<typeof setTimeout> | null = null;
  private _closeTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly _onViewportChange = (): void => {
    if (this._visible) this._position();
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this._clearTimers();
      this._unbindViewport();
      this._ref?.destroy();
    });
  }

  private get _enabled(): boolean {
    return !this.lTooltipDisabled() && this.lTooltip().trim().length > 0;
  }

  protected _onEnter(): void {
    if (this.lTooltipTrigger() === 'hover') this._scheduleShow();
  }

  protected _onLeave(): void {
    if (this.lTooltipTrigger() === 'hover') this._scheduleHide();
  }

  protected _onFocus(): void {
    // Keyboard focus reveals the tooltip for hover and focus triggers alike.
    if (this.lTooltipTrigger() !== 'click') this._scheduleShow();
  }

  protected _onBlur(): void {
    if (this.lTooltipTrigger() !== 'click') this._scheduleHide();
  }

  protected _onClick(): void {
    if (this.lTooltipTrigger() !== 'click') return;
    this._visible ? this._hide() : this._show();
  }

  protected _onEscape(): void {
    if (this._visible) this._hide();
  }

  private _scheduleShow(): void {
    this._clearTimer('close');
    if (this._visible || !this._enabled) return;
    this._openTimer = setTimeout(() => this._show(), this.lTooltipOpenDelay());
  }

  private _scheduleHide(): void {
    this._clearTimer('open');
    if (!this._visible) return;
    this._closeTimer = setTimeout(() => this._hide(), this.lTooltipCloseDelay());
  }

  private _show(): void {
    if (!this._enabled) return;
    const ref = this._ensure();
    ref.setInput('content', this.lTooltip());
    ref.setInput('arrow', this.lTooltipArrow());
    ref.setInput('side', PLACEMENTS[this.lTooltipPlacement()].side);

    const el = ref.location.nativeElement as HTMLElement;
    if (this.lTooltipColor()) this._renderer.setStyle(el, '--l-tooltip-bg', this.lTooltipColor());
    const maxWidth = this.lTooltipMaxWidth();
    if (maxWidth) this._renderer.setStyle(el, '--l-tooltip-max-width', `${maxWidth}px`);

    ref.changeDetectorRef.detectChanges();
    this._position();

    this._visible = true;
    requestAnimationFrame(() => {
      ref.setInput('visible', true);
      ref.changeDetectorRef.detectChanges();
    });

    window.addEventListener('scroll', this._onViewportChange, true);
    window.addEventListener('resize', this._onViewportChange);
  }

  private _hide(): void {
    if (!this._ref) return;
    this._visible = false;
    this._ref.setInput('visible', false);
    this._ref.changeDetectorRef.detectChanges();
    this._unbindViewport();
  }

  private _ensure(): ComponentRef<Tooltip> {
    if (this._ref) return this._ref;
    this._ref = this._vcr.createComponent(Tooltip);
    this._ref.setInput('id', this._id);
    // Portal the bubble into <body> so it escapes ancestor overflow clipping.
    this._renderer.appendChild(document.body, this._ref.location.nativeElement);
    return this._ref;
  }

  private _position(): void {
    const ref = this._ref;
    if (!ref) return;
    const el = ref.location.nativeElement as HTMLElement;
    const host = this._host.nativeElement.getBoundingClientRect();
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const gap = 8;
    const margin = 6;

    let { side, align } = PLACEMENTS[this.lTooltipPlacement()];

    // Flip to the opposite side when the preferred one would overflow.
    if (side === 'top' && host.top - th - gap < margin && host.bottom + th + gap <= vh - margin) {
      side = 'bottom';
    } else if (
      side === 'bottom' &&
      host.bottom + th + gap > vh - margin &&
      host.top - th - gap >= margin
    ) {
      side = 'top';
    } else if (
      side === 'left' &&
      host.left - tw - gap < margin &&
      host.right + tw + gap <= vw - margin
    ) {
      side = 'right';
    } else if (
      side === 'right' &&
      host.right + tw + gap > vw - margin &&
      host.left - tw - gap >= margin
    ) {
      side = 'left';
    }

    const cx = host.left + host.width / 2;
    const cy = host.top + host.height / 2;
    let top: number;
    let left: number;
    let arrowPos: number;

    if (side === 'top' || side === 'bottom') {
      top = side === 'top' ? host.top - th - gap : host.bottom + gap;
      left = align === 'start' ? host.left : align === 'end' ? host.right - tw : cx - tw / 2;
      left = _clamp(left, margin, vw - tw - margin);
      arrowPos = _clamp(cx - left, 12, tw - 12);
    } else {
      left = side === 'left' ? host.left - tw - gap : host.right + gap;
      top = align === 'start' ? host.top : align === 'end' ? host.bottom - th : cy - th / 2;
      top = _clamp(top, margin, vh - th - margin);
      arrowPos = _clamp(cy - top, 12, th - 12);
    }

    ref.setInput('side', side);
    this._renderer.setStyle(el, 'top', `${Math.round(top)}px`);
    this._renderer.setStyle(el, 'left', `${Math.round(left)}px`);
    this._renderer.setStyle(el, '--l-tooltip-arrow-pos', `${Math.round(arrowPos)}px`);
  }

  private _clearTimer(which: 'open' | 'close'): void {
    if (which === 'open' && this._openTimer) {
      clearTimeout(this._openTimer);
      this._openTimer = null;
    }
    if (which === 'close' && this._closeTimer) {
      clearTimeout(this._closeTimer);
      this._closeTimer = null;
    }
  }

  private _clearTimers(): void {
    this._clearTimer('open');
    this._clearTimer('close');
  }

  private _unbindViewport(): void {
    window.removeEventListener('scroll', this._onViewportChange, true);
    window.removeEventListener('resize', this._onViewportChange);
  }
}
