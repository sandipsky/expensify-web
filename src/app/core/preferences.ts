import { Injectable, signal } from '@angular/core';

/**
 * The profile preferences screens format and group with (§8 `users/{uid}`:
 * `locale`, `baseCurrency`, `monthStartDay`, `weekStartDay`). A stand-in until sign-in and
 * onboarding create the profile (M0/M1): the locale comes from the browser and
 * the currency defaults to the Nepalese rupee until onboarding asks for it (ONB-01).
 */
@Injectable({ providedIn: 'root' })
export class Preferences {
  readonly locale = signal(navigator.language || 'en-US');
  readonly baseCurrency = signal('NPR');
  /** Day 1–28 each month's period starts on (BR-05); Settings will change it (M2). */
  readonly monthStartDay = signal(1);
  /** ISO weekday weekly budgets start on, 1 = Monday … 7 = Sunday; Settings will change it (SET-05). */
  readonly weekStartDay = signal(1);
}
