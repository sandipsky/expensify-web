import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BackupRepo } from '../../core/data/backup.repo';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  Backup,
  BackupCounts,
  BackupError,
  SCHEMA_VERSION,
  backupCounts,
  backupFileName,
  parseBackup,
} from '../../core/domain/backup';
import { clampStartDay, clampWeekday } from '../../core/domain/period';
import { Preferences } from '../../core/preferences';
import { Today } from '../../core/today';
import { ConfirmDialog, ConfirmDialogData, ModalService } from '../../shared/components/ui/modal';
import { NotificationService } from '../../shared/components/ui/notification';
import { readText, saveFile } from '../../shared/files/download';

/**
 * The JSON backup (DAT-03) and restoring one into an empty account (DAT-04).
 * Both run on the device from the local cache, offline too.
 */
@Injectable({ providedIn: 'root' })
export class BackupActions {
  private readonly repo = inject(BackupRepo);
  private readonly prefs = inject(Preferences);
  private readonly today = inject(Today).date;
  private readonly modals = inject(ModalService);
  private readonly notify = inject(NotificationService);

  /** Whether anything a restore would clash with exists (DAT-04). */
  hasData(): Promise<boolean> {
    return this.repo.hasData();
  }

  /** Saves every account, category, transaction, budget and rule as one JSON file. */
  async download(): Promise<BackupCounts> {
    const backup: Backup = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      source: 'web',
      profile: {
        baseCurrency: this.prefs.baseCurrency(),
        locale: this.prefs.locale(),
        monthStartDay: this.prefs.monthStartDay(),
        weekStartDay: this.prefs.weekStartDay(),
      },
      ...(await this.repo.read()),
    };
    const json = JSON.stringify(backup, null, 2);
    saveFile(new Blob([json], { type: 'application/json' }), backupFileName(this.today()));
    const counts = backupCounts(backup);
    this.notify.success('Backup downloaded', summary(counts));
    return counts;
  }

  /**
   * Reads a backup file, says what's in it and restores it once confirmed.
   * Only into an account with no accounts, transactions, budgets or rules, so
   * nothing is merged or overwritten. Resolves to whether it restored.
   */
  async restore(file: Blob): Promise<boolean> {
    if (await this.repo.hasData()) {
      this.notify.warn(
        'Restore needs an empty account',
        'Delete your accounts, budgets and recurring rules first, or download a backup of them.',
      );
      return false;
    }
    let text: string;
    try {
      text = await readText(file);
    } catch {
      this.notify.error("Couldn't read that file", 'Please pick it again.');
      return false;
    }
    const result = parseBackup(text);
    if (!result.ok) {
      this.notify.error("Couldn't restore that file", backupErrorMessage(result.error));
      return false;
    }
    const { backup } = result;
    const counts = backupCounts(backup);
    const confirmed = await firstValueFrom(
      this.modals
        .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
          data: {
            title: 'Restore this backup?',
            message:
              `${backupDate(backup, this.prefs.locale())}${summary(counts)}. ` +
              'Your categories are replaced with the backup’s. Receipts aren’t part of a backup.',
            confirmText: 'Restore',
            confirmVariant: 'primary',
          },
        })
        .afterClosed(),
    );
    if (!confirmed) return false;

    // Stand-ins until the profile document exists (M1): this session follows the backup.
    const { profile } = backup;
    if (profile.baseCurrency) this.prefs.baseCurrency.set(profile.baseCurrency);
    this.prefs.monthStartDay.set(clampStartDay(profile.monthStartDay));
    this.prefs.weekStartDay.set(clampWeekday(profile.weekStartDay));

    // Not awaited: the writes land in the local cache at once (NFR-03).
    void this.repo.restore(backup);
    this.notify.success('Backup restored', summary(counts));
    return true;
  }
}

/** "3 accounts, 41 categories, 1,203 transactions, 2 budgets and 1 recurring rule". */
export function summary(counts: BackupCounts): string {
  const parts = [
    plural(counts.accounts, 'account'),
    plural(counts.categories, 'category', 'categories'),
    plural(counts.transactions, 'transaction'),
    plural(counts.budgets, 'budget'),
    plural(counts.recurringRules, 'recurring rule'),
  ];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function backupErrorMessage(error: BackupError): string {
  switch (error.code) {
    case 'not_json':
    case 'not_backup':
      return 'It isn’t an Expensify backup. Pick the .json file a backup downloaded.';
    case 'newer_version':
      return 'It comes from a newer version of the app. Update the app, then try again.';
    case 'invalid_document':
      return 'Part of it is damaged, so nothing was restored.';
    case 'missing_account':
      return 'It has transactions on an account it doesn’t include, so nothing was restored.';
  }
}

function backupDate(backup: Backup, locale: string): string {
  const date = Date.parse(backup.exportedAt);
  if (!Number.isFinite(date)) return 'It holds ';
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
  return `From ${when}: `;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
