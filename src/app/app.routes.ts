import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { onboardingGuard, onboardingPageGuard } from './core/auth/onboarding.guard';

/**
 * The route table of §10. The sign-in pages are outside the shell; everything
 * inside it needs a signed-in user who has finished onboarding (`authGuard`,
 * `onboardingGuard`).
 */
export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login-page/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    title: 'Create account',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/register-page/register-page').then((m) => m.RegisterPage),
  },
  {
    path: 'forgot-password',
    title: 'Reset password',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/forgot-password-page/forgot-password-page').then(
        (m) => m.ForgotPasswordPage,
      ),
  },
  {
    path: 'onboarding',
    title: 'Welcome',
    canActivate: [authGuard, onboardingPageGuard],
    loadComponent: () =>
      import('./features/onboarding/onboarding-page/onboarding-page').then((m) => m.OnboardingPage),
  },
  {
    path: '',
    canActivate: [authGuard, onboardingGuard],
    canActivateChild: [authGuard, onboardingGuard],
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard-page/dashboard-page').then((m) => m.DashboardPage),
      },
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
        loadChildren: () =>
          import('./features/budgets/budgets.routes').then((m) => m.BUDGETS_ROUTES),
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
          import('./features/categories/categories-page/categories-page').then(
            (m) => m.CategoriesPage,
          ),
      },
      {
        path: 'settings',
        loadChildren: () =>
          import('./features/settings/settings.routes').then((m) => m.SETTINGS_ROUTES),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
