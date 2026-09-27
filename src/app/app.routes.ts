import { Routes } from '@angular/router';

// authGuard, onboardingGuard and adminGuard (§10) arrive with sign-in, and the
// dashboard becomes the default route once it exists.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'accounts' },
  {
    path: 'accounts',
    loadChildren: () =>
      import('./features/accounts/accounts.routes').then((m) => m.ACCOUNTS_ROUTES),
  },
  { path: '**', redirectTo: 'accounts' },
];
