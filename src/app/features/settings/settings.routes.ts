import { Routes } from '@angular/router';

export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    title: 'Settings',
    loadComponent: () => import('./settings-page/settings-page').then((m) => m.SettingsPage),
  },
  {
    path: 'import',
    title: 'Import transactions',
    loadComponent: () => import('./import/import-page/import-page').then((m) => m.ImportPage),
  },
];
