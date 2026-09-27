import { InjectionToken } from '@angular/core';

/**
 * Pure-CSS entry/leave animations supported by the modal.
 * Each value maps to a `.modal-anim-<name>` class with matching
 * `@keyframes` defined in the modal container styles.
 */
export type ModalAnimation =
  'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'fade' | 'zoom' | 'none';

export interface ModalConfig<D = any> {
  /** Arbitrary data injected into the component (via MODAL_DATA) or exposed on the template context. */
  data?: D;

  /** Panel width, e.g. '40vw', '500px'. */
  width?: string;
  /** Panel height. */
  height?: string;
  /** Panel max width (defaults to 90vw). */
  maxWidth?: string;

  /** Extra class(es) applied to the panel element. */
  panelClass?: string | string[];

  /** Render the dimmed backdrop behind the panel. Default: true. */
  backdrop?: boolean;

  /** Prevent closing on backdrop click / Escape key. Default: false. */
  disableClose?: boolean;

  /** Entry/leave animation. Default: 'slideUp'. */
  animation?: ModalAnimation;

  /** Animation duration in milliseconds. Default: 250. */
  animationDuration?: number;
}

export const MODAL_DEFAULTS: Required<
  Omit<ModalConfig, 'data' | 'width' | 'height' | 'panelClass'>
> = {
  maxWidth: '90vw',
  backdrop: true,
  disableClose: false,
  animation: 'slideUp',
  animationDuration: 250,
};

/** Injection token used to read the data passed to a component opened in the modal (like MAT_DIALOG_DATA). */
export const MODAL_DATA = new InjectionToken<any>('MODAL_DATA');
