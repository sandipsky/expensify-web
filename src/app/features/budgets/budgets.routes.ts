import { Routes } from '@angular/router';

export const BUDGETS_ROUTES: Routes = [
  {
    path: '',
    title: 'Budgets',
    loadComponent: () => import('./budgets-page/budgets-page').then((m) => m.BudgetsPage),
  },
  {
    path: ':id',
    title: 'Budget',
    loadComponent: () => import('./budget-detail/budget-detail').then((m) => m.BudgetDetail),
  },
];
