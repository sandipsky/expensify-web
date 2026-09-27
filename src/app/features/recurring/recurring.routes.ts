import { Routes } from '@angular/router';

export const RECURRING_ROUTES: Routes = [
  {
    path: '',
    title: 'Recurring',
    loadComponent: () => import('./recurring-page/recurring-page').then((m) => m.RecurringPage),
  },
  {
    path: ':id',
    title: 'Recurring rule',
    loadComponent: () => import('./rule-detail/rule-detail').then((m) => m.RuleDetail),
  },
];
