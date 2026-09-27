import {
  ApplicationConfig,
  Injector,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // Budget alerts watch spending from any screen (BUD-06). They load after
    // start-up, which keeps them out of the initial bundle (NFR-02).
    provideAppInitializer(() => {
      const injector = inject(Injector);
      void import('./features/budgets/budget-alerts').then((m) => injector.get(m.BudgetAlerts));
    }),
    // Due recurring entries are created from any screen, including ones missed
    // while the app was closed (REC-04, REC-06). Also loaded after start-up.
    provideAppInitializer(() => {
      const injector = inject(Injector);
      void import('./features/recurring/recurring-runner').then((m) =>
        injector.get(m.RecurringRunner),
      );
    }),
  ],
};
