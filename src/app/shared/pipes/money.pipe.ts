import { Pipe, PipeTransform, inject } from '@angular/core';
import { formatMoney } from '../../core/domain/money';
import { Preferences } from '../../core/preferences';

/**
 * Minor units → currency text in the user's locale (NFR-17). Pass
 * `'exceptZero'` to show the +/− that income and expense carry (NFR-09).
 *
 * ```html
 * {{ account.currentBalance | money: account.currency }}
 * {{ effect | money: currency : 'exceptZero' }}
 * ```
 */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  private readonly locale = inject(Preferences).locale;

  transform(
    minor: number | null | undefined,
    currency: string,
    signDisplay: 'auto' | 'always' | 'exceptZero' | 'never' = 'auto',
  ): string {
    if (minor === null || minor === undefined) return '';
    return formatMoney(minor, currency, this.locale(), signDisplay);
  }
}
