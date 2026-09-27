import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { flipForLiability, isLiability } from '../../../core/domain/account';
import {
  MAX_AMOUNT,
  currencySymbol,
  fractionDigits,
  toMajorUnits,
  toMinorUnits,
} from '../../../core/domain/money';
import { Account, AccountType } from '../../../core/models/account';
import { Preferences } from '../../../core/preferences';
import { Button } from '../../../shared/components/ui/button/button';
import { NumberInput } from '../../../shared/components/ui/input/number-input/number-input';
import { Select } from '../../../shared/components/ui/input/select/select';
import { TextInput } from '../../../shared/components/ui/input/text-input/text-input';
import { Toggle } from '../../../shared/components/ui/input/toggle/toggle';
import { NotificationService } from '../../../shared/components/ui/notification';
import { injectSheet } from '../../../shared/services/sheet.service';
import { ACCOUNT_TYPE_OPTIONS } from '../account-labels';
import { AccountsStore } from '../accounts.store';

export interface AccountFormData {
  /** The account to edit; omit to add one. */
  account?: Account;
}

/** Required that also rejects names made only of spaces. */
function notBlank(control: AbstractControl<string | null>): ValidationErrors | null {
  return (control.value ?? '').trim() ? null : { required: true };
}

/**
 * Add or edit an account (ACC-01, ACC-03). Cards and loans enter the amount owed,
 * stored as a negative balance (ACC-08). Icon and color come from the type; there
 * is no picker for them yet. Amount fields hold major units, as `l-number-input`
 * does, and become integer minor units only on save (BR-01).
 */
@Component({
  selector: 'app-account-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button, NumberInput, Select, TextInput, Toggle],
  templateUrl: './account-form.html',
  styleUrl: './account-form.scss',
})
export class AccountForm {
  protected readonly sheet = injectSheet<AccountFormData, string>();
  private readonly store = inject(AccountsStore);
  private readonly notify = inject(NotificationService);

  protected readonly account = this.sheet.data?.account;
  private readonly currency = this.account?.currency ?? this.store.currency();
  protected readonly decimalPlaces = fractionDigits(this.currency);
  protected readonly symbol = currencySymbol(this.currency, inject(Preferences).locale());
  protected readonly typeOptions = ACCOUNT_TYPE_OPTIONS;

  /** BR-03's cap, in the major units the fields hold. */
  private readonly max = toMajorUnits(MAX_AMOUNT, this.currency);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: [this.account?.name ?? '', [notBlank, Validators.maxLength(40)]],
    type: [this.account?.type ?? ('cash' as AccountType), Validators.required],
    balance: [
      this.account
        ? toMajorUnits(
            flipForLiability(this.account.type, this.account.openingBalance),
            this.currency,
          )
        : (0 as number | null),
      [Validators.required, Validators.min(-this.max), Validators.max(this.max)],
    ],
    creditLimit: [
      this.account?.creditLimit ? toMajorUnits(this.account.creditLimit, this.currency) : null,
      Validators.max(this.max),
    ],
    includeInTotal: [this.account?.includeInTotal ?? true],
  });

  protected readonly type = toSignal(this.form.controls.type.valueChanges, {
    initialValue: this.form.controls.type.value,
  });

  protected readonly balanceLabel = computed(() => {
    if (!isLiability(this.type())) return 'Opening balance';
    return this.account ? 'Opening amount owed' : 'Amount owed';
  });

  protected readonly balanceHint = computed(() => {
    if (this.account) return 'Changing it moves the current balance by the same amount.';
    return isLiability(this.type()) ? 'What you owe today.' : "What's in the account today.";
  });

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const input = {
      name: value.name.trim(),
      type: value.type,
      openingBalance: flipForLiability(value.type, toMinorUnits(value.balance ?? 0, this.currency)),
      // A zero limit means none, so no utilization is shown.
      creditLimit:
        value.type === 'credit_card' && value.creditLimit
          ? toMinorUnits(value.creditLimit, this.currency)
          : null,
      includeInTotal: value.includeInTotal,
    };
    if (this.account) {
      this.store.update(this.account, input);
      this.notify.success('Account updated', input.name);
      this.sheet.close(this.account.id);
    } else {
      const id = this.store.create(input);
      this.notify.success('Account added', input.name);
      this.sheet.close(id);
    }
  }
}
