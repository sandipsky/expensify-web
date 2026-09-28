import { TestBed } from '@angular/core/testing';
import { Preferences } from '../core/preferences';
import { THEME_KEY, ThemeService, applyTheme } from './theme';

describe('ThemeService (SET-06)', () => {
  const root = document.documentElement;

  beforeEach(() => {
    localStorage.clear();
    delete root.dataset['theme'];
  });

  afterEach(() => delete root.dataset['theme']);

  it('pins light or dark on <html>, and leaves it to the system otherwise', () => {
    applyTheme('dark');
    expect(root.dataset['theme']).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    applyTheme('light');
    expect(root.dataset['theme']).toBe('light');
    applyTheme('system');
    expect('theme' in root.dataset).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBe('system');
  });

  it('follows the theme preference', () => {
    TestBed.inject(ThemeService);
    TestBed.tick();
    expect('theme' in root.dataset).toBe(false);

    TestBed.inject(Preferences).save({ theme: 'dark' });
    TestBed.tick();
    expect(root.dataset['theme']).toBe('dark');
  });
});
