import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { filter, firstValueFrom, take, timeout } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { UsersRepo } from '../../../core/data/users.repo';
import { flipForLiability, isLiability } from '../../../core/domain/account';
import { DEFAULT_CATEGORIES } from '../../../core/domain/default-categories';
import {
  MAX_AMOUNT,
  currencySymbol,
  fractionDigits,
  toMajorUnits,
  toMinorUnits,
} from '../../../core/domain/money';
import { AccountType } from '../../../core/models/account';
import { Preferences } from '../../../core/preferences';
import { SymbolIcon } from '../../../shared/components/symbol-icon/symbol-icon';
import { Button } from '../../../shared/components/ui/button/button';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { NumberInput } from '../../../shared/components/ui/input/number-input/number-input';
import { Select } from '../../../shared/components/ui/input/select/select';
import { TextInput } from '../../../shared/components/ui/input/text-input/text-input';
import { NotificationService } from '../../../shared/components/ui/notification';
import { Step, Stepper } from '../../../shared/components/ui/stepper';
import { ACCOUNT_TYPE_OPTIONS } from '../../accounts/account-labels';
import { AccountsStore } from '../../accounts/accounts.store';
import { CategoriesStore } from '../../categories/categories.store';
import { currencyOptions } from '../../settings/settings-labels';

/** How long to wait for the profile to confirm onboarding is done before moving on anyway. */
const CONFIRM_TIMEOUT_MS = 3000;

const STEPS: readonly Step[] = [
  { title: 'Currency', description: 'What you count in' },
  { title: 'First account', description: 'Where your money is' },
  { title: 'Categories', description: 'Review the defaults' },
];

/** Required that also rejects names made only of spaces. */
function notBlank(control: AbstractControl<string | null>): ValidationErrors | null {
  return (control.value ?? '').trim() ? null : { required: true };
}

/**
 * `/onboarding` (§3.2): three skippable steps on first sign-in (ONB-01). The
 * currency starts as the guess from the browser's locale, the first account
 * as "Cash" with a zero balance, and the last step shows the Appendix A
 * categories that will be seeded under their fixed IDs (ONB-02, ONB-03).
 * Finishing, or skipping, marks the profile so this never shows again (ONB-04).
 */
@Component({
  selector: 'app-onboarding-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button, Icon, NumberInput, Select, Stepper, SymbolIcon, TextInput],
  templateUrl: './onboarding-page.html',
  styleUrl: './onboarding-page.scss',
})
export class OnboardingPage {
  private readonly auth = inject(AuthService);
  private readonly prefs = inject(Preferences);
  private readonly users = inject(UsersRepo);
  private readonly accounts = inject(AccountsStore);
  private readonly categories = inject(CategoriesStore);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);

  /** Made here, in the injection context `toObservable` needs; `complete()` runs outside it. */
  private readonly profile$ = toObservable(this.auth.profile);

  protected readonly steps = STEPS;
  protected readonly active = signal(0);
  protected readonly finishing = signal(false);
  /** The user chose to go on without a first account. */
  protected readonly accountSkipped = signal(false);

  protected readonly firstName = computed(
    () => this.auth.user()?.displayName?.trim().split(/\s+/)[0] ?? '',
  );
  protected readonly currencyOptions = computed(() => currencyOptions(this.prefs.locale()));
  protected readonly typeOptions = ACCOUNT_TYPE_OPTIONS;
  protected readonly defaults = {
    expense: DEFAULT_CATEGORIES.filter((c) => c.type === 'expense' && !c.isSystem),
    income: DEFAULT_CATEGORIES.filter((c) => c.type === 'income' && !c.isSystem),
  };

  protected readonly form = inject(FormBuilder).nonNullable.group({
    currency: [this.prefs.baseCurrency(), Validators.required],
    name: ['Cash', [notBlank, Validators.maxLength(40)]],
    type: ['cash' as AccountType, Validators.required],
    balance: [0 as number | null, Validators.required],
  });

  protected readonly currency = toSignal(this.form.controls.currency.valueChanges, {
    initialValue: this.form.controls.currency.value,
  });
  protected readonly type = toSignal(this.form.controls.type.valueChanges, {
    initialValue: this.form.controls.type.value,
  });
  protected readonly decimalPlaces = computed(() => fractionDigits(this.currency()));
  protected readonly symbol = computed(() => currencySymbol(this.currency(), this.prefs.locale()));
  protected readonly balanceLabel = computed(() =>
    isLiability(this.type()) ? 'Amount owed' : 'Balance today',
  );

  protected next(): void {
    if (this.active() === 0 && this.form.controls.currency.invalid) return;
    if (this.active() === 1) {
      if (this.form.controls.name.invalid || this.form.controls.balance.invalid) {
        this.form.markAllAsTouched();
        return;
      }
      this.accountSkipped.set(false);
    }
    this.active.update((step) => Math.min(step + 1, STEPS.length - 1));
  }

  protected back(): void {
    this.active.update((step) => Math.max(step - 1, 0));
  }

  /** Moves on without this step's choice: the currency keeps its guess, the account isn't made. */
  protected skipStep(): void {
    if (this.active() === 1) this.accountSkipped.set(true);
    this.active.update((step) => Math.min(step + 1, STEPS.length - 1));
  }

  /** Saves the choices, seeds the categories and opens the app (ONB-01 to ONB-04). */
  protected finish(): void {
    void this.complete(true);
  }

  /** Straight to the app: only the categories are seeded, so entries can be filed at once. */
  protected skipAll(): void {
    void this.complete(false);
  }

  private async complete(withChoices: boolean): Promise<void> {
    if (this.finishing()) return;
    this.finishing.set(true);
    try {
      // The one step that can fail goes first, so trying again never writes the account twice.
      await this.categories.seedMissing();
      const value = this.form.getRawValue();
      const currency = withChoices ? value.currency : this.prefs.baseCurrency();
      if (withChoices && currency !== this.prefs.baseCurrency()) {
        this.prefs.save({ baseCurrency: currency });
      }
      if (withChoices && !this.accountSkipped()) {
        const balance = Math.max(
          -this.max(currency),
          Math.min(this.max(currency), value.balance ?? 0),
        );
        this.accounts.create(
          {
            name: value.name.trim(),
            type: value.type,
            openingBalance: flipForLiability(value.type, toMinorUnits(balance, currency)),
            creditLimit: null,
            includeInTotal: true,
          },
          currency,
        );
      }
      this.users.completeOnboarding();
      await this.confirmed();
      await this.router.navigateByUrl('/dashboard');
    } catch (error) {
      console.error('[onboarding failed]', error);
      this.notify.error("Couldn't finish setting up", 'Please try again.');
      this.finishing.set(false);
    }
  }

  /** BR-03's cap in the major units the balance field holds. */
  private max(currency: string): number {
    return toMajorUnits(MAX_AMOUNT, currency);
  }

  /** Waits for the profile to show onboarding done, so the guards let the dashboard open. */
  private confirmed(): Promise<unknown> {
    return firstValueFrom(
      this.profile$.pipe(
        filter((profile) => !!profile?.onboardingCompleted),
        take(1),
        timeout({ first: CONFIRM_TIMEOUT_MS }),
      ),
    ).catch(() => undefined);
  }
}
