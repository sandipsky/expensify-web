import { Routes } from '@angular/router';

// authGuard, onboardingGuard and adminGuard (§10) arrive with sign-in, and the
// dashboard becomes the default route once it exists.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'accounts' },
  {
    path: 'transactions',
    loadChildren: () =>
      import('./features/transactions/transactions.routes').then((m) => m.TRANSACTIONS_ROUTES),
  },
  {
    path: 'accounts',
    loadChildren: () =>
      import('./features/accounts/accounts.routes').then((m) => m.ACCOUNTS_ROUTES),
  },
  {
    path: 'budgets',
    loadChildren: () => import('./features/budgets/budgets.routes').then((m) => m.BUDGETS_ROUTES),
  },
  {
    path: 'reports/monthly',
    title: 'Monthly report',
    loadComponent: () =>
      import('./features/reports/monthly-report/monthly-report').then((m) => m.MonthlyReport),
  },
  {
    path: 'reports',
    title: 'Reports',
    loadComponent: () =>
      import('./features/reports/reports-page/reports-page').then((m) => m.ReportsPage),
  },
  {
    path: 'recurring',
    loadChildren: () =>
      import('./features/recurring/recurring.routes').then((m) => m.RECURRING_ROUTES),
  },
  {
    path: 'categories',
    title: 'Categories',
    loadComponent: () =>
      import('./features/categories/categories-page/categories-page').then((m) => m.CategoriesPage),
  },
  {
    path: 'settings',
    loadChildren: () =>
      import('./features/settings/settings.routes').then((m) => m.SETTINGS_ROUTES),
  },
  { path: '**', redirectTo: 'accounts' },
];
