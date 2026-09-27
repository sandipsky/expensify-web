import { InjectionToken } from '@angular/core';

/**
 * Edge the drawer is anchored to. The position alone determines the
 * enter/leave animation:
 *   left   → slides in to the right  (closes by sliding left)
 *   right  → slides in to the left   (closes by sliding right)
 *   bottom → slides up               (closes by sliding down)
 */
export type DrawerPosition = 'left' | 'right' | 'bottom';

export interface DrawerConfig<D = any> {
  /** Arbitrary data injected into the component (via DRAWER_DATA) or exposed on the template context. */
  data?: D;

  /** Edge the panel docks to. Default: 'right'. */
  position?: DrawerPosition;

  /**
   * Size of the panel along its sliding axis — the width for left/right
   * drawers, the height for bottom drawers. E.g. '420px', '30vw', '50vh'.
   */
  size?: string;

  /** Extra class(es) applied to the panel element. */
  panelClass?: string | string[];

  /** Render the dimmed backdrop behind the panel. Default: true. */
  backdrop?: boolean;

  /** Prevent closing on backdrop click / Escape key. Default: false. */
  disableClose?: boolean;

  /** Animation duration in milliseconds. Default: 280. */
  animationDuration?: number;
}

export const DRAWER_DEFAULTS: Required<Omit<DrawerConfig, 'data' | 'size' | 'panelClass'>> = {
  position: 'right',
  backdrop: true,
  disableClose: false,
  animationDuration: 280,
};

/** Injection token used to read the data passed to a component opened in the drawer. */
export const DRAWER_DATA = new InjectionToken<any>('DRAWER_DATA');
