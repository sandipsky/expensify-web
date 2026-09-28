import {
  ApplicationConfig,
  Injector,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { Preferences } from './core/preferences';
import { ThemeService } from './layout/theme';
import { L_WEEK_START } from './shared/components/ui/input/date-input/week-start';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // Date pickers start their weeks on the user's first day of the week (SET-05).
    { provide: L_WEEK_START, useFactory: () => inject(Preferences).weekStartDay },
    // The theme applies before the first screen renders (SET-06).
    provideAppInitializer(() => void inject(ThemeService)),
    // Budget alerts watch spending from any screen (BUD-06). They load after
    // start-up, which keeps them out of the initial bundle (NFR-02).
    provideAppInitializer(() => {
      const injector = inject(Injector);
      void import('./features/budgets/budget-alerts').then((m) => injector.get(m.BudgetAlerts));
    }),
    // Reminders to log today's spending and for ask-first recurring entries
    // (NTF-01, NTF-03), from any screen. Also loaded after start-up.
    provideAppInitializer(() => {
      const injector = inject(Injector);
      void Promise.all([
        import('./features/notifications/daily-reminder'),
        import('./features/notifications/bill-reminders'),
      ]).then(([daily, bills]) => {
        injector.get(daily.DailyReminder);
        injector.get(bills.BillReminders);
      });
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
