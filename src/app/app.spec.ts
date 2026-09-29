import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AuthService } from './core/auth/auth.service';

describe('App', () => {
  const settled = signal(false);

  beforeEach(async () => {
    settled.set(false);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: AuthService, useValue: { settled } }],
    }).compileComponents();
  });

  it('covers the page until the session is known, then shows the router outlet (AUTH-05)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('router-outlet')).not.toBeNull();
    expect(el.querySelector('.app-boot')?.textContent).toContain('Loading your account');

    settled.set(true);
    await fixture.whenStable();
    expect(el.querySelector('.app-boot')).toBeNull();
    expect(el.querySelector('l-loading-spinner')).not.toBeNull();
  });
});
