import { Routes } from '@angular/router';

const page = () => import('./transactions-page/transactions-page').then((m) => m.TransactionsPage);

/** The list, and the form's deep links, which open it over the list (§10 routes). */
export const TRANSACTIONS_ROUTES: Routes = [
  { path: '', title: 'Transactions', loadComponent: page },
  { path: 'new', title: 'Add transaction', data: { quickAdd: true }, loadComponent: page },
  { path: ':id', title: 'Transaction', loadComponent: page },
];
