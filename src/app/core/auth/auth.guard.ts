import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { AuthService, LOGIN_URL } from './auth.service';

// Every guard injects before it awaits: `inject()` only works while the guard
// runs synchronously in the router's injection context.

/**
 * Signed in, or off to sign-in and back afterwards (AUTH-06). Works as
 * `canActivate` and as `canActivateChild` on the shell, so every page behind
 * the shell is covered (§10 routes).
 */
export const authGuard: CanActivateFn & CanActivateChildFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready();
  if (auth.user()) return true;
  const returnUrl = state.url;
  return router.createUrlTree(
    [LOGIN_URL],
    returnUrl && returnUrl !== '/' ? { queryParams: { returnUrl } } : {},
  );
};

/** The sign-in pages are for signed-out users; anyone signed in goes to the app. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready();
  return auth.user() ? router.createUrlTree(['/']) : true;
};
