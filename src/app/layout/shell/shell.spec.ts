import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { BudgetAlerts } from '../../features/budgets/budget-alerts';
import { BillReminders } from '../../features/notifications/bill-reminders';
import { DailyReminder } from '../../features/notifications/daily-reminder';
import { RecurringRunner } from '../../features/recurring/recurring-runner';
import { TransactionActions } from '../../features/transactions/transaction-actions';
import { IconRegistry } from '../../shared/components/ui/icon/icon';
import { ModalService } from '../../shared/components/ui/modal';
import { NavBadges } from '../nav-badges';
import { Shell } from './shell';

describe('Shell', () => {
  const originalMatchMedia = window.matchMedia;
  const create = vi.fn(() => of(undefined));
  const signOut = vi.fn(() => Promise.resolve());

  beforeEach(async () => {
    // jsdom has no `matchMedia`; the layout's sidebar reads it on creation.
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;

    await TestBed.configureTestingModule({
      imports: [Shell],
      providers: [
        provideRouter([]),
        // jsdom can't fetch the svg files.
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
        { provide: TransactionActions, useValue: { create } },
        {
          provide: AuthService,
          useValue: {
            user: signal({
              uid: 'u1',
              email: 'ada@example.com',
              displayName: 'Ada Lovelace',
              photoURL: null,
              providers: ['password'],
            }),
            signOut,
          },
        },
        // The background features the shell starts aren't under test here.
        { provide: BudgetAlerts, useValue: {} },
        { provide: DailyReminder, useValue: {} },
        { provide: BillReminders, useValue: {} },
        { provide: RecurringRunner, useValue: {} },
      ],
    }).compileComponents();
    create.mockClear();
    signOut.mockClear();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('renders the router outlet inside the layout shell', async () => {
    const fixture = TestBed.createComponent(Shell);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('l-layout main router-outlet')).not.toBeNull();
  });

  it('links to every feature from the sidebar', async () => {
    const fixture = TestBed.createComponent(Shell);
    await fixture.whenStable();
    const links = () =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('l-sidebar nav a')].map((a) => [
        a.getAttribute('href'),
        a.textContent?.trim(),
      ]);
    expect(links()).toEqual([
      ['/dashboard', 'Dashboard'],
      ['/transactions', 'Transactions'],
      ['/accounts', 'Accounts'],
      ['/budgets', 'Budgets'],
      ['/reports', 'Reports'],
      ['/recurring', 'Recurring'],
      ['/categories', 'Categories'],
      ['/settings', 'Settings'],
    ]);
  });

  it('shows how many recurring entries wait to be confirmed (REC-04)', async () => {
    const fixture = TestBed.createComponent(Shell);
    await fixture.whenStable();
    TestBed.inject(NavBadges).recurring.set(2);
    await fixture.whenStable();
    const link = (fixture.nativeElement as HTMLElement).querySelector('a[href="/recurring"]')!;
    expect(link.textContent?.replace(/\s+/g, ' ').trim()).toBe('Recurring 2 waiting for you');
  });

  it('names the signed-in user in the account menu and signs out from it', async () => {
    const fixture = TestBed.createComponent(Shell);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.app-header__account') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(document.body.textContent).toContain('Ada Lovelace');
    expect(document.body.textContent).toContain('ada@example.com');
    const button = [...document.querySelectorAll('.app-account__item')].find((b) =>
      b.textContent?.includes('Sign out'),
    ) as HTMLButtonElement;
    button.click();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  describe('quick add (TXN-05)', () => {
    const press = (target: EventTarget, key = 'n', init: KeyboardEventInit = {}) =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
    /** Quick add loads its module lazily; preloading keeps that import quick and within the test. */
    beforeAll(() => import('../../features/transactions/transaction-actions'));
    const settle = () => new Promise((resolve) => setTimeout(resolve));

    it('opens from the header button', async () => {
      const fixture = TestBed.createComponent(Shell);
      await fixture.whenStable();
      const button = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll('l-button button'),
      ].find((b) => b.textContent?.includes('Add transaction')) as HTMLButtonElement;
      button.click();
      await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    });

    it('opens with N, but not while typing, with a modifier or with a dialog open', async () => {
      const fixture = TestBed.createComponent(Shell);
      await fixture.whenStable();

      press(document.body, 'n', { ctrlKey: true });
      const input = document.createElement('input');
      document.body.appendChild(input);
      press(input);
      input.remove();
      const modals = TestBed.inject(ModalService);
      const hasOpen = vi.spyOn(modals, 'hasOpen').mockReturnValue(true);
      press(document.body);
      hasOpen.mockRestore();
      await settle();
      expect(create).not.toHaveBeenCalled();

      press(document.body, 'N');
      await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    });
  });
});
