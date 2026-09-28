import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { TransactionsRepo } from '../../core/data/transactions.repo';
import { UserDataRepo } from '../../core/data/user-data.repo';
import { Preferences } from '../../core/preferences';
import { ModalService } from '../../shared/components/ui/modal';
import { NotificationService } from '../../shared/components/ui/notification';
import { SpinnerService } from '../../shared/services/spinner.service';
import { AccountsStore } from '../accounts/accounts.store';
import { AlertInbox } from '../notifications/alert-inbox';
import { DataActions } from './data-actions';

describe('DataActions (SET-01, SET-04)', () => {
  let confirmed: boolean | undefined;
  const open = vi.fn(() => ({ afterClosed: () => of(confirmed) }));
  const notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
  let actions: DataActions;
  let prefs: Preferences;

  const dialog = () =>
    (open.mock.calls.at(-1) as unknown as [unknown, { data: Record<string, unknown> }])[1].data;

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
    vi.clearAllMocks();
    confirmed = true;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ModalService, useValue: { open } },
        { provide: NotificationService, useValue: notify },
      ],
    });
    prefs = TestBed.inject(Preferences);
    prefs.save({ baseCurrency: 'USD', locale: 'en-US' });
    actions = TestBed.inject(DataActions);
  });

  describe('changeCurrency (SET-01)', () => {
    it('switches at once while nothing is entered', async () => {
      expect(await actions.changeCurrency('JPY')).toBe(true);
      expect(open).not.toHaveBeenCalled();
      expect(prefs.baseCurrency()).toBe('JPY');
    });

    it('relabels accounts and entries once confirmed, amounts unchanged', async () => {
      const cash = seed();
      expect(await actions.changeCurrency('EUR')).toBe(true);
      expect(dialog()['message']).toContain('$123,456.00 becomes €123,456.00');
      expect(prefs.baseCurrency()).toBe('EUR');
      await vi.waitFor(() =>
        expect(TestBed.inject(AccountsStore).byId(cash)).toMatchObject({
          currency: 'EUR',
          currentBalance: 3750,
        }),
      );
    });

    it('stays put when cancelled', async () => {
      seed();
      confirmed = false;
      expect(await actions.changeCurrency('EUR')).toBe(false);
      expect(prefs.baseCurrency()).toBe('USD');
    });

    it('refuses a currency with other decimal places once amounts exist', async () => {
      seed();
      expect(await actions.changeCurrency('JPY')).toBe(false);
      expect(open).not.toHaveBeenCalled();
      expect(notify.warn).toHaveBeenCalledWith(
        'Can’t switch to Japanese Yen',
        expect.stringContaining('2 decimal places and JPY has no decimal places'),
        expect.anything(),
      );
      expect(prefs.baseCurrency()).toBe('USD');
    });
  });

  describe('deleteAllTransactions (SET-04)', () => {
    it('deletes every transaction once confirmed, balances back to opening', async () => {
      const cash = seed();
      expect(await actions.deleteAllTransactions()).toBe(true);
      expect(dialog()).toMatchObject({
        title: 'Delete all 1 transaction?',
        confirmVariant: 'danger',
      });
      await vi.waitFor(async () =>
        expect(await TestBed.inject(UserDataRepo).countTransactions()).toBe(0),
      );
      expect(TestBed.inject(AccountsStore).byId(cash)?.currentBalance).toBe(5000);
      expect(notify.success).toHaveBeenCalledWith('Deleted 1 transaction', expect.any(String));
    });

    it('asks nothing when there are none, and keeps them when cancelled', async () => {
      expect(await actions.deleteAllTransactions()).toBe(false);
      expect(open).not.toHaveBeenCalled();

      seed();
      confirmed = false;
      expect(await actions.deleteAllTransactions()).toBe(false);
      expect(await TestBed.inject(UserDataRepo).countTransactions()).toBe(1);
    });
  });

  describe('deleteAccount (SET-04)', () => {
    it('asks for DELETE, then wipes the data, the alerts and the profile', async () => {
      seed();
      const inbox = TestBed.inject(AlertInbox);
      inbox.add({ id: 'a', kind: 'budget', tone: 'warn', title: 'Food', message: '', link: null });
      const spinner = TestBed.inject(SpinnerService);
      const show = vi.spyOn(spinner, 'show');
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

      expect(await actions.deleteAccount()).toBe(true);
      expect(dialog()).toMatchObject({ confirmPhrase: 'DELETE', confirmVariant: 'danger' });
      expect(show).toHaveBeenCalled();
      expect(spinner.visible()).toBe(false);
      expect(TestBed.inject(AccountsStore).all()).toEqual([]);
      expect(inbox.alerts()).toEqual([]);
      expect(prefs.baseCurrency()).toBe('NPR');
      expect(navigate).toHaveBeenCalledWith('/');
    });

    it('keeps everything when cancelled', async () => {
      seed();
      confirmed = false;
      expect(await actions.deleteAccount()).toBe(false);
      expect(TestBed.inject(AccountsStore).all()).toHaveLength(1);
    });
  });
});
