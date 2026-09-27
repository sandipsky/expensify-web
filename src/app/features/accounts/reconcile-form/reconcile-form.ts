import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { flipForLiability, isLiability } from '../../../core/domain/account';
import {
  MAX_AMOUNT,
  currencySymbol,
  fractionDigits,
  toMajorUnits,
  toMinorUnits,
} from '../../../core/domain/money';
import { Account } from '../../../core/models/account';
import { Preferences } from '../../../core/preferences';
import { Button } from '../../../shared/components/ui/button/button';
import { NumberInput } from '../../../shared/components/ui/input/number-input/number-input';
import { NotificationService } from '../../../shared/components/ui/notification';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { injectSheet } from '../../../shared/services/sheet.service';
import { balanceView } from '../account-labels';
import { AccountsStore } from '../accounts.store';

export interface ReconcileFormData {
  account: Account;
}

/**
 * Reconcile (ACC-07): the user types the real balance and the difference is
 * recorded as a "Balance adjustment", which reports and budgets leave out (BR-12).
 * The field holds major units, as `l-number-input` does; the difference is
 * worked out in integer minor units (BR-01).
 */
@Component({
  selector: 'app-reconcile-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button, MoneyPipe, NumberInput],
  templateUrl: './reconcile-form.html',
  styleUrl: './reconcile-form.scss',
})
export class ReconcileForm {
  protected readonly sheet = injectSheet<ReconcileFormData, void>();
  private readonly store = inject(AccountsStore);
  private readonly notify = inject(NotificationService);

  private readonly opened = this.sheet.data!.account;

  /** Follows the live account, so a balance change from elsewhere shows up here. */
  protected readonly account = computed(() => this.store.byId(this.opened.id) ?? this.opened);
  protected readonly current = computed(() => balanceView(this.account()));
  protected readonly liability = computed(() => isLiability(this.account().type));
  protected readonly decimalPlaces = fractionDigits(this.opened.currency);
  protected readonly symbol = currencySymbol(this.opened.currency, inject(Preferences).locale());

  protected readonly form = inject(FormBuilder).nonNullable.group({
    actual: [
      toMajorUnits(
        flipForLiability(this.opened.type, this.opened.currentBalance),
        this.opened.currency,
      ) as number | null,
      Validators.required,
    ],
  });

  private readonly actual = toSignal(this.form.controls.actual.valueChanges, {
    initialValue: this.form.controls.actual.value,
  });

  /** Signed change to the stored balance in minor units, or null while the field is empty. */
  protected readonly difference = computed(() => {
    const actual = this.actual();
    if (actual === null) return null;
    const account = this.account();
    return this.toStored(account, actual) - account.currentBalance;
  });

  protected readonly tooLarge = computed(() => Math.abs(this.difference() ?? 0) > MAX_AMOUNT);

  protected save(): void {
    if (this.form.invalid || this.tooLarge()) {
      this.form.markAllAsTouched();
      return;
    }
    const account = this.account();
    const actual = this.toStored(account, this.form.controls.actual.value ?? 0);
    const adjustment = this.store.reconcile(account, actual);
    if (adjustment) {
      this.notify.success('Balance adjusted', `${account.name} now matches what you entered.`);
    } else {
      this.notify.info('Already matches', `${account.name} needed no adjustment.`);
    }
    this.sheet.close();
  }

  /** The typed figure (major units, owed for cards and loans) as a stored balance. */
  private toStored(account: Account, major: number): number {
    return flipForLiability(account.type, toMinorUnits(major, account.currency));
  }
}
