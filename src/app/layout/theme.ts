import { Injectable, effect, inject } from '@angular/core';
import { Theme } from '../core/models/user';
import { Preferences } from '../core/preferences';

/**
 * Where the last theme is kept for the first paint: `index.html` reads it
 * before the app starts, so a dark theme doesn't flash light while the profile
 * loads.
 */
export const THEME_KEY = 'expensify.theme';

/**
 * Applies the theme preference (SET-06) as `data-theme` on `<html>`: `light`
 * or `dark` pin it, and no attribute follows the system through
 * `prefers-color-scheme`. The colors themselves are the tokens in
 * `_colors.scss`. Started from the app config.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  constructor() {
    const theme = inject(Preferences).theme;
    effect(() => applyTheme(theme()));
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset['theme'];
  else root.dataset['theme'] = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage blocked: the theme still applies once the profile loads.
  }
}
