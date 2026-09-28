import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { parseISO } from 'date-fns';
import { formatMoney } from '../../../core/domain/money';
import {
  clampStartDay,
  clampWeekday,
  formatPeriod,
  monthPeriod,
} from '../../../core/domain/period';
import { THEMES, Theme } from '../../../core/models/user';
import { Preferences, deviceLocale } from '../../../core/preferences';
import { Today } from '../../../core/today';
import { Card } from '../../../shared/components/ui/card/card';
import { Select } from '../../../shared/components/ui/input/select/select';
import { SegmentedControl } from '../../../shared/components/ui/segmented-control';
import { DataActions } from '../data-actions';
import {
  MONTH_START_OPTIONS,
  THEME_OPTIONS,
  currencyOptions,
  formatSample,
  localeOptions,
  weekStartOptions,
} from '../settings-labels';

/**
 * Settings › Preferences: the base currency and how amounts and dates are
 * written (SET-01), the month start day (SET-02), the first day of the week
 * (SET-05) and the theme (SET-06). Each change saves at once.
 */
@Component({
  selector: 'app-preference-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Card, Select, SegmentedControl],
  templateUrl: './preference-settings.html',
  styleUrl: './preference-settings.scss',
})
export class PreferenceSettings {
  protected readonly prefs = inject(Preferences);
  private readonly actions = inject(DataActions);
  private readonly today = inject(Today).date;

  protected readonly currencyOptions = computed(() => currencyOptions(this.prefs.locale()));
  protected readonly localeOptions = computed(() =>
    localeOptions(this.prefs.locale(), deviceLocale()),
  );
  protected readonly monthStartOptions = MONTH_START_OPTIONS;
  protected readonly weekStartOptions = computed(() => weekStartOptions(this.prefs.locale()));
  protected readonly themeOptions = THEME_OPTIONS;

  /**
   * What the currency picker shows. It moves back to the saved currency when a
   * switch is refused or cancelled, since the picker already shows the pick.
   */
  protected readonly currency = linkedSignal(() => this.prefs.baseCurrency());

  /** "Rs 1,234,567.89 · 28 Sep 2026". */
  protected readonly sample = computed(() => {
    const locale = this.prefs.locale();
    const currency = this.prefs.baseCurrency();
    return formatSample(
      locale,
      (minor) => formatMoney(minor, currency, locale),
      parseISO(this.today()),
    );
  });

  /** "This month runs 25 Sep – 24 Oct 2026." */
  protected readonly period = computed(() =>
    formatPeriod(monthPeriod(this.today(), this.prefs.monthStartDay()), this.prefs.locale()),
  );

  protected async setCurrency(value: unknown): Promise<void> {
    if (typeof value !== 'string' || !value) return;
    this.currency.set(value);
    await this.actions.changeCurrency(value);
    this.currency.set(this.prefs.baseCurrency());
  }

  protected setLocale(value: unknown): void {
    if (typeof value === 'string' && value && value !== this.prefs.locale()) {
      this.prefs.save({ locale: value });
    }
  }

  protected setMonthStart(value: unknown): void {
    const day = clampStartDay(Number(value));
    if (day !== this.prefs.monthStartDay()) this.prefs.save({ monthStartDay: day });
  }

  protected setWeekStart(value: unknown): void {
    const day = clampWeekday(Number(value));
    if (day !== this.prefs.weekStartDay()) this.prefs.save({ weekStartDay: day });
  }

  protected setTheme(value: unknown): void {
    if (THEMES.includes(value as Theme) && value !== this.prefs.theme()) {
      this.prefs.save({ theme: value as Theme });
    }
  }
}
