import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { AuthService } from './auth.service';
import { authGuard, guestGuard } from './auth.guard';
import { onboardingGuard, onboardingPageGuard } from './onboarding.guard';

interface FakeAuth {
  user: unknown;
  onboardingCompleted?: boolean;
}

describe('route guards (§10: authGuard, onboardingGuard)', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = (url: string) => ({ url }) as RouterStateSnapshot;

  function setup({ user, onboardingCompleted = true }: FakeAuth) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            ready: () => Promise.resolve(),
            user: signal(user),
            profile: signal(user ? { onboardingCompleted } : null),
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
    expect(await run(guestGuard)).toBe(true);
  });

  it('lets a new sign-up straight in, through onboarding first (AUTH-02, ONB-04)', async () => {
    setup({ user: { uid: 'u1' }, onboardingCompleted: false });
    expect(await run(authGuard)).toBe(true);
    expect(await run(guestGuard)).toBe('/');
    expect(await run(onboardingGuard)).toBe('/onboarding');
    expect(await run(onboardingPageGuard)).toBe(true);

    setup({ user: { uid: 'u1' }, onboardingCompleted: true });
    expect(await run(onboardingGuard)).toBe(true);
    expect(await run(onboardingPageGuard)).toBe('/dashboard');
  });
});
