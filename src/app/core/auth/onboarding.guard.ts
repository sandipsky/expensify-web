import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** A user who hasn't finished onboarding goes there first (ONB-04). Runs after `authGuard`. */
export const onboardingGuard: CanActivateFn & CanActivateChildFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready();
  return auth.profile()?.onboardingCompleted ? true : router.createUrlTree(['/onboarding']);
};

/** The onboarding page itself is skipped once it's done (ONB-04). Runs after `authGuard`. */
export const onboardingPageGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready();
  return auth.profile()?.onboardingCompleted ? router.createUrlTree(['/dashboard']) : true;
};
