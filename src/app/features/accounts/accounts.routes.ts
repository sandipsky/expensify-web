import { Routes } from '@angular/router';

export const ACCOUNTS_ROUTES: Routes = [
  {
    path: '',
    title: 'Accounts',
    loadComponent: () => import('./accounts-page/accounts-page').then((m) => m.AccountsPage),
  },
  {
    path: ':id',
    title: 'Account',
    loadComponent: () => import('./account-detail/account-detail').then((m) => m.AccountDetail),
  },
];
