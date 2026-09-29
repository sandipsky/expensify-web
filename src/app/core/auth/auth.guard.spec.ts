import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { adminGuard } from './admin.guard';
import { AuthService } from './auth.service';
import { authGuard, guestGuard, noAccessGuard } from './auth.guard';
import { onboardingGuard, onboardingPageGuard } from './onboarding.guard';

interface FakeAuth {
  user: unknown;
  status?: 'pending' | 'active' | 'disabled';
  role?: 'user' | 'admin';
  onboardingCompleted?: boolean;
}

describe('route guards (§10: authGuard, onboardingGuard, adminGuard)', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = (url: string) => ({ url }) as RouterStateSnapshot;

  function setup({ user, status, role = 'user', onboardingCompleted = true }: FakeAuth) {
    const active = status === 'active';
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            ready: () => Promise.resolve(),
            user: signal(user),
            isActive: signal(active),
            isAdmin: signal(active && role === 'admin'),
            profile: signal(user ? { status, role, onboardingCompleted } : null),
          },
        },
      ],
    });
  }

  const run = async (guard: (...args: never[]) => unknown, url = '/budgets') => {
    const result = await TestBed.runInInjectionContext(() =>
      (guard as (r: ActivatedRouteSnapshot, s: RouterStateSnapshot) => unknown)(route, state(url)),
    );
    return result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result;
  };

  it('sends signed-out users to sign-in and back afterwards (AUTH-06)', async () => {
    setup({ user: null });
    expect(await run(authGuard, '/budgets/b1')).toBe('/login?returnUrl=%2Fbudgets%2Fb1');
    expect(await run(authGuard, '/')).toBe('/login');
    expect(await run(noAccessGuard)).toBe('/login');
    expect(await run(guestGuard)).toBe(true);
  });

  it('keeps pending and disabled users on the blocked screen (ADM-02)', async () => {
    setup({ user: { uid: 'u1' }, status: 'pending' });
    expect(await run(authGuard)).toBe('/no-access');
    expect(await run(noAccessGuard)).toBe(true);
    expect(await run(guestGuard)).toBe('/');

    setup({ user: { uid: 'u1' }, status: 'disabled' });
    expect(await run(authGuard)).toBe('/no-access');
  });

  it('lets active users in, through onboarding first (ONB-04)', async () => {
    setup({ user: { uid: 'u1' }, status: 'active', onboardingCompleted: false });
    expect(await run(authGuard)).toBe(true);
    expect(await run(onboardingGuard)).toBe('/onboarding');
    expect(await run(onboardingPageGuard)).toBe(true);
    expect(await run(noAccessGuard)).toBe('/');

    setup({ user: { uid: 'u1' }, status: 'active', onboardingCompleted: true });
    expect(await run(onboardingGuard)).toBe(true);
    expect(await run(onboardingPageGuard)).toBe('/dashboard');
  });

  it('keeps /admin for active admins (ADM-03)', async () => {
    setup({ user: { uid: 'u1' }, status: 'active', role: 'user' });
    expect(await run(adminGuard)).toBe('/dashboard');
    setup({ user: { uid: 'u1' }, status: 'active', role: 'admin' });
    expect(await run(adminGuard)).toBe(true);
    setup({ user: { uid: 'u1' }, status: 'disabled', role: 'admin' });
    expect(await run(adminGuard)).toBe('/dashboard');
  });
});
