import { InjectionToken, Signal } from '@angular/core';

/**
 * The first day of the calendar's weeks for every `l-date-input` that doesn't
 * set `weekStart`: an ISO weekday, 1 = Monday … 7 = Sunday. Provide a signal
 * to follow a user setting. Without it, weeks start on Sunday. Kept apart from
 * the component so providing it doesn't pull the picker into the first bundle.
 *
 * ```ts
 * { provide: L_WEEK_START, useFactory: () => inject(Preferences).weekStartDay }
 * ```
 */
export const L_WEEK_START = new InjectionToken<Signal<number>>('L_WEEK_START');
