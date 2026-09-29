import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** `/admin/*` is for admins (ADM-03); everyone else lands on the dashboard. Runs after `authGuard`. */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready();
  return auth.isAdmin() ? true : router.createUrlTree(['/dashboard']);
};
