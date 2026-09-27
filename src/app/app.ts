import { Component, Injector, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BreakpointService } from './layout/breakpoint.service';
import { NavBadges } from './layout/nav-badges';
import { Layout } from './shared/components/layout';
import { Button } from './shared/components/ui/button/button';
import { DrawerService } from './shared/components/ui/drawer';
import { Icon } from './shared/components/ui/icon/icon';
import { ModalService } from './shared/components/ui/modal';

/** Where a keystroke is text entry, so N types an "n" there instead of opening quick add. */
const EDITABLE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="combobox"], [role="listbox"]';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Layout, Button, Icon],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class App {
  /** Desktop sidebar state: collapsed to a rail shows icons only. */
  protected readonly navCollapsed = signal(false);
  protected readonly breakpoints = inject(BreakpointService);
  protected readonly badges = inject(NavBadges);
  private readonly injector = inject(Injector);
  private readonly modals = inject(ModalService);
  private readonly drawers = inject(DrawerService);

  /**
   * Quick add from any screen (TXN-05). The form loads on first use, which
   * keeps it out of the initial bundle (NFR-02).
   */
  protected async quickAdd(): Promise<void> {
    const { TransactionActions } = await import('./features/transactions/transaction-actions');
    this.injector.get(TransactionActions).create().subscribe();
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
}
