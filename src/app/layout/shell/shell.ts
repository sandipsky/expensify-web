import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  ProviderToken,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AlertInbox } from '../../features/notifications/alert-inbox';
import { alertsLabel } from '../../features/notifications/notification-labels';
import { Layout } from '../../shared/components/layout';
import { Avatar } from '../../shared/components/ui/avatar/avatar';
import { BadgeDirective } from '../../shared/components/ui/badge';
import { Button } from '../../shared/components/ui/button/button';
import { DrawerService } from '../../shared/components/ui/drawer';
import { Icon } from '../../shared/components/ui/icon/icon';
import { Menu } from '../../shared/components/ui/menu';
import { ModalService } from '../../shared/components/ui/modal';
import { BreakpointService } from '../breakpoint.service';
import { NavBadges } from '../nav-badges';

/** Where a keystroke is text entry, so N types an "n" there instead of opening quick add. */
const EDITABLE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="combobox"], [role="listbox"]';

/**
 * The app shell (§10): side navigation, header with the alerts bell, quick
 * add and the account menu, and the page. It only renders for a signed-in
 * user who finished onboarding, so this is also where the features that work
 * from any screen start: budget alerts (BUD-06), reminders (NTF-01, NTF-03)
 * and due recurring entries (REC-04, REC-06). They load after the shell,
 * which keeps them out of the initial bundle (NFR-02).
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    Layout,
    Avatar,
    BadgeDirective,
    Button,
    Icon,
    Menu,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class Shell {
  /** Desktop sidebar state: collapsed to a rail shows icons only. */
  protected readonly navCollapsed = signal(false);
  protected readonly breakpoints = inject(BreakpointService);
  protected readonly badges = inject(NavBadges);
  protected readonly inbox = inject(AlertInbox);
  protected readonly alertsLabel = alertsLabel;
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private readonly modals = inject(ModalService);
  private readonly drawers = inject(DrawerService);

  protected readonly user = this.auth.user;
  /** What the account menu calls the user: their name, else their email. */
  protected readonly displayName = computed(
    () => this.user()?.displayName || this.user()?.email || 'Your account',
  );

  /** Set once the shell is gone, so a feature that loads late isn't started on a dead injector. */
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    this.startBackgroundFeatures();
  }

  /**
   * Quick add from any screen (TXN-05). The form loads on first use, which
   * keeps it out of the initial bundle (NFR-02).
   */
  protected async quickAdd(): Promise<void> {
    const { TransactionActions } = await import('../../features/transactions/transaction-actions');
    this.injector.get(TransactionActions).create().subscribe();
  }

  /**
   * The recent alerts (NTF-05): a side panel on tablets and desktops, a bottom
   * sheet on phones. Loaded on first use (NFR-02).
   */
  protected async openAlerts(): Promise<void> {
    const { AlertsPanel } = await import('../../features/notifications/alerts-panel/alerts-panel');
    const phone = this.breakpoints.phone();
    this.drawers.open(AlertsPanel, {
      position: phone ? 'bottom' : 'right',
      size: phone ? '75vh' : '400px',
    });
  }

  protected signOut(): void {
    void this.auth.signOut();
  }

  /** N opens quick add, except while typing or with a dialog or sheet open (TXN-05). */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'n' && event.key !== 'N') return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.defaultPrevented) {
      return;
    }
    if (this.modals.hasOpen() || this.drawers.hasOpen()) return;
    if (event.target instanceof Element && event.target.closest(EDITABLE)) return;
    event.preventDefault();
    void this.quickAdd();
  }

  private startBackgroundFeatures(): void {
    void import('../../features/budgets/budget-alerts').then((m) => this.start(m.BudgetAlerts));
    void Promise.all([
      import('../../features/notifications/daily-reminder'),
      import('../../features/notifications/bill-reminders'),
    ]).then(([daily, bills]) => {
      this.start(daily.DailyReminder);
      this.start(bills.BillReminders);
    });
    void import('../../features/recurring/recurring-runner').then((m) =>
      this.start(m.RecurringRunner),
    );
  }

  /** Instantiates a root service, which starts its listeners, unless the shell has been destroyed. */
  private start(service: ProviderToken<unknown>): void {
    if (!this.destroyed) this.injector.get(service);
  }
}
