import { Injectable, signal } from '@angular/core';

/**
 * The profile preferences screens format with (§8 `users/{uid}`: `locale`,
 * `baseCurrency`). A stand-in until sign-in and onboarding create the profile
 * (M0/M1): the locale comes from the browser and the currency defaults to the
 * Nepalese rupee until onboarding asks for it (ONB-01).
 */
@Injectable({ providedIn: 'root' })
export class Preferences {
  readonly locale = signal(navigator.language || 'en-US');
  readonly baseCurrency = signal('NPR');
}
