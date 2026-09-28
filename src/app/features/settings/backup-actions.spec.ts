import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { TransactionsRepo } from '../../core/data/transactions.repo';
import { BACKUP_FORMAT, Backup } from '../../core/domain/backup';
import { Preferences } from '../../core/preferences';
import { ModalService } from '../../shared/components/ui/modal';
import { NotificationService } from '../../shared/components/ui/notification';
import { AccountsStore } from '../accounts/accounts.store';
import { BackupActions, summary } from './backup-actions';

/** Files handed to the browser: jsdom can't make object URLs of its blobs or follow downloads. */
function captureDownloads() {
  const files: { name: string; blob: Blob }[] = [];
  const blobs = new Map<string, Blob>();
  const create = URL.createObjectURL;
  const revoke = URL.revokeObjectURL;
  URL.createObjectURL = (blob: Blob) => {
    const url = `blob:test/${blobs.size + 1}`;
    blobs.set(url, blob);
    return url;
  };
  URL.revokeObjectURL = () => {};
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    files.push({ name: this.download, blob: blobs.get(this.href)! });
  });
  const restore = () => {
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    click.mockRestore();
  };
  return { files, restore };
}

describe('BackupActions (DAT-03, DAT-04)', () => {
  let downloads: ReturnType<typeof captureDownloads>;
  let confirmed: boolean;
  const prefs = () => ({
    locale: signal('en-US'),
    baseCurrency: signal('USD'),
    monthStartDay: signal(1),
    weekStartDay: signal(1),
  });

  const setUp = (preferences = prefs()) => {
    TestBed.configureTestingModule({
      providers: [
        { provide: Preferences, useValue: preferences },
        { provide: ModalService, useValue: { open: () => ({ afterClosed: () => of(confirmed) }) } },
      ],
    });
    return preferences;
  };

  const seed = () => {
    const cash = TestBed.inject(AccountsStore).create({
      name: 'Cash',
      type: 'cash',
      openingBalance: 5000,
      creditLimit: null,
      includeInTotal: true,
    });
    TestBed.inject(TransactionsRepo).add({
      type: 'expense',
      amount: 1250,
      currency: 'USD',
      accountId: cash,
      categoryId: 'exp_food',
      date: '2026-09-25',
      tags: [],
    });
    return cash;
  };

  beforeEach(() => {
    localStorage.clear();
    confirmed = true;
    downloads = captureDownloads();
  });

  afterEach(() => downloads.restore());

  it('downloads every collection with the profile as one JSON file', async () => {
    setUp();
    seed();
    const counts = await TestBed.inject(BackupActions).download();
    expect(counts).toMatchObject({ accounts: 1, transactions: 1, budgets: 0 });
    const [file] = downloads.files;
    expect(file.name).toMatch(/^expensify-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const backup = JSON.parse(await file.blob.text()) as Backup;
    expect(backup).toMatchObject({
      format: BACKUP_FORMAT,
      version: 1,
      source: 'web',
      profile: { baseCurrency: 'USD', monthStartDay: 1, weekStartDay: 1 },
    });
    expect(backup.accounts[0]).toMatchObject({ name: 'Cash', currentBalance: 3750 });
  });

  it('restores only into an empty account', async () => {
    setUp();
    seed();
    const warn = vi.spyOn(TestBed.inject(NotificationService), 'warn');
    const file = new Blob(['{}'], { type: 'application/json' });
    expect(await TestBed.inject(BackupActions).restore(file)).toBe(false);
    expect(warn).toHaveBeenCalledWith('Restore needs an empty account', expect.any(String));
  });

  it('refuses a file that isn’t a backup', async () => {
    setUp();
    const error = vi.spyOn(TestBed.inject(NotificationService), 'error');
    expect(await TestBed.inject(BackupActions).restore(new Blob(['nope']))).toBe(false);
    expect(error).toHaveBeenCalledWith("Couldn't restore that file", expect.any(String));
  });

  it('restores a backup once confirmed, with its preferences', async () => {
    setUp();
    const cash = seed();
    await TestBed.inject(BackupActions).download();
    const file = downloads.files[0].blob;

    TestBed.resetTestingModule();
    localStorage.clear();
    const preferences = setUp({ ...prefs(), baseCurrency: signal('NPR') });
    const actions = TestBed.inject(BackupActions);

    confirmed = false;
    expect(await actions.restore(file)).toBe(false);
    expect(TestBed.inject(AccountsStore).all()).toEqual([]);

    confirmed = true;
    expect(await actions.restore(file)).toBe(true);
    await vi.waitFor(() =>
      expect(TestBed.inject(AccountsStore).byId(cash)?.currentBalance).toBe(3750),
    );
    expect(preferences.baseCurrency()).toBe('USD');
    expect(await actions.hasData()).toBe(true);
  });

  it('sums up what a backup holds', () => {
    expect(
      summary({ accounts: 1, categories: 2, transactions: 30, budgets: 0, recurringRules: 1 }),
    ).toBe('1 account, 2 categories, 30 transactions, 0 budgets and 1 recurring rule');
  });
});
