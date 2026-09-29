import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService, LOGIN_URL } from '../../core/auth/auth.service';
import { BackupRepo } from '../../core/data/backup.repo';
import { UserDataRepo } from '../../core/data/user-data.repo';
import { formatMoney, fractionDigits } from '../../core/domain/money';
import { Preferences } from '../../core/preferences';
import { ConfirmDialog, ConfirmDialogData, ModalService } from '../../shared/components/ui/modal';
import { NotificationService } from '../../shared/components/ui/notification';
import { SpinnerService } from '../../shared/services/spinner.service';
import { AlertInbox } from '../notifications/alert-inbox';
import { clearNotificationState } from '../notifications/device-state';
import { entries } from '../transactions/transaction-labels';
import { Reauth } from './reauth';
import { currencyName } from './settings-labels';

/** Where a deleted account lands, with a note that says so. */
export const DELETED_URL = `${LOGIN_URL}?deleted=1`;

/**
 * The Settings actions that change data in bulk: switching the base currency
 * (SET-01), deleting every transaction and deleting the account (SET-04).
 * Each asks first, since none has an Undo.
 */
@Injectable({ providedIn: 'root' })
export class DataActions {
  private readonly repo = inject(UserDataRepo);
  private readonly backups = inject(BackupRepo);
  private readonly prefs = inject(Preferences);
  private readonly modals = inject(ModalService);
  private readonly notify = inject(NotificationService);
  private readonly spinner = inject(SpinnerService);
  private readonly inbox = inject(AlertInbox);
  private readonly auth = inject(AuthService);
  private readonly reauth = inject(Reauth);

  /**
   * Makes `currency` the base currency (SET-01). With nothing entered yet it
   * just switches. Otherwise amounts keep their numbers, since there are no
   * exchange rates (CUR-01 is later): that's only allowed between currencies
   * with the same decimal places, so 12.50 can't become ¥1,250, and it's
   * confirmed first. Resolves to whether it switched.
   */
  async changeCurrency(currency: string): Promise<boolean> {
    const from = this.prefs.baseCurrency();
    if (currency === from) return false;
    const locale = this.prefs.locale();
    const name = currencyName(currency, locale);
    if (!(await this.backups.hasData())) {
      this.prefs.save({ baseCurrency: currency });
      this.notify.success('Currency changed', `Amounts are now in ${name}.`);
      return true;
    }
    const digits = fractionDigits(from);
    if (fractionDigits(currency) !== digits) {
      this.notify.warn(
        `Can’t switch to ${name}`,
        `Your amounts have ${places(digits)} and ${currency} has ` +
          `${places(fractionDigits(currency))}, so every amount would change. ` +
          `Pick a currency with ${places(digits)}.`,
        { duration: 8000 },
      );
      return false;
    }
    const sample = 123_456 * 10 ** digits;
    const confirmed = await this.confirm({
      title: `Switch to ${name}?`,
      message:
        'Amounts keep their numbers and aren’t converted: ' +
        `${formatMoney(sample, from, locale)} becomes ${formatMoney(sample, currency, locale)}. ` +
        `Your accounts and transactions switch to ${currency}.`,
      confirmText: 'Switch currency',
      confirmVariant: 'primary',
    });
    if (!confirmed) return false;
    this.prefs.save({ baseCurrency: currency });
    // Not awaited: the local cache updates at once (NFR-03).
    void this.repo.relabelCurrency(currency).then((ok) => {
      if (!ok)
        this.notify.error('Couldn’t switch every entry', 'Please choose the currency again.');
    });
    this.notify.success('Currency changed', `Amounts are now in ${name}.`);
    return true;
  }

  /**
   * Deletes every transaction once confirmed (SET-04). Balances go back to
   * the opening balances; accounts, categories, budgets and rules stay.
   */
  async deleteAllTransactions(): Promise<boolean> {
    const count = await this.repo.countTransactions();
    if (!count) {
      this.notify.info('No transactions to delete');
      return false;
    }
    const confirmed = await this.confirm({
      title: `Delete all ${entries(count)}?`,
      message:
        'Every account goes back to its opening balance, and receipts go with their ' +
        'transactions. Accounts, categories, budgets and recurring rules stay. ' +
        'This can’t be undone.',
      confirmText: 'Delete all',
      confirmVariant: 'danger',
    });
    if (!confirmed) return false;
    // Not awaited: the local cache updates at once (NFR-03).
    void this.repo.deleteAllTransactions().then((ok) => {
      if (!ok) {
        this.notify.error('Couldn’t delete every transaction', 'Some are left. Please try again.');
      }
    });
    this.notify.success(
      `Deleted ${entries(count)}`,
      'Balances are back to their opening balances.',
    );
    return true;
  }

  /**
   * Deletes the account once the user types DELETE and proves it's them
   * (AUTH-07, SET-04): all their data on every device, receipts too, then the
   * profile, then the login itself (§12). The spinner holds the screen while
   * it runs, and the app reloads on the sign-in page with a note (US-09).
   */
  async deleteAccount(): Promise<boolean> {
    const confirmed = await this.confirm({
      title: 'Delete your account?',
      message:
        'This deletes your accounts, transactions, categories, budgets, recurring rules and ' +
        'receipts on every device, then your profile and your login. It can’t be undone, so ' +
        'download a backup first if you might want them back.',
      confirmText: 'Delete account',
      confirmVariant: 'danger',
      confirmPhrase: 'DELETE',
    });
    if (!confirmed) return false;
    try {
      if (!(await this.reauth.confirm('Deleting your account needs a fresh sign-in first.'))) {
        return false;
      }
    } catch (error) {
      this.notify.error('Couldn’t confirm it’s you', error instanceof Error ? error.message : '');
      return false;
    }
    this.spinner.show();
    let ok = false;
    try {
      ok = await this.repo.deleteAll();
      if (ok) await this.auth.deleteLogin();
    } catch (error) {
      console.error('[account delete failed]', error);
      ok = false;
    } finally {
      this.spinner.hide();
    }
    if (!ok) {
      this.notify.error('Couldn’t delete your account', 'Some data is left. Please try again.');
      return false;
    }
    this.inbox.clear();
    clearNotificationState();
    this.auth.leave(DELETED_URL);
    return true;
  }

  private confirm(data: ConfirmDialogData): Promise<boolean | undefined> {
    return firstValueFrom(
      this.modals
        .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data })
        .afterClosed(),
    );
  }
}

/** "2 decimal places", "no decimal places". */
function places(digits: number): string {
  if (!digits) return 'no decimal places';
  return `${digits} decimal ${digits === 1 ? 'place' : 'places'}`;
}
