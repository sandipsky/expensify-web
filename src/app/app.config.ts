import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { Db } from './core/data/db';
import { FirestoreDb } from './core/firebase/firestore-db';
import { Preferences } from './core/preferences';
import { ThemeService } from './layout/theme';
import { L_WEEK_START } from './shared/components/ui/input/date-input/week-start';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // The repos read and write Cloud Firestore (§10). The unit tests keep the
    // default, the localStorage stand-in.
    { provide: Db, useClass: FirestoreDb },
    // Date pickers start their weeks on the user's first day of the week (SET-05).
    { provide: L_WEEK_START, useFactory: () => inject(Preferences).weekStartDay },
    // The theme applies before the first screen renders (SET-06).
    provideAppInitializer(() => void inject(ThemeService)),
    // Budget alerts, reminders and due recurring entries start with the shell,
    // once the user is signed in and active (layout/shell).
  ],
};
