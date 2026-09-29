import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { format, parseISO } from 'date-fns';
import { BreakpointService } from '../../../layout/breakpoint.service';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { Breadcrumb } from '../../../shared/components/ui/breadcrumb';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { DateInput } from '../../../shared/components/ui/input/date-input/date-input';
import { SegmentedControl } from '../../../shared/components/ui/segmented-control';
import { Skeleton } from '../../../shared/components/ui/skeleton';
import { SheetService } from '../../../shared/services/sheet.service';
import { TransactionActions } from '../../transactions/transaction-actions';
import { BalancesCard } from '../balances-card/balances-card';
import { BudgetsCard } from '../budgets-card/budgets-card';
import { CustomizeSheet } from '../customize-sheet/customize-sheet';
import { DASHBOARD_PRESET_OPTIONS, DashboardPreset } from '../dashboard-labels';
import { DashboardStore } from '../dashboard.store';
import { LargestCard } from '../largest-card/largest-card';
import { RecentCard } from '../recent-card/recent-card';
import { SpendingCard } from '../spending-card/spending-card';
import { SummaryCards } from '../summary-cards/summary-cards';
import { TrendCard } from '../trend-card/trend-card';
import { UpcomingCard } from '../upcoming-card/upcoming-card';

/**
 * `/dashboard` (§3.7), the default screen: the period switcher pinned to the
 * top (DSH-06), then the cards in the user's order (DSH-16), one column on
 * phones, two on tablets, and the desktop arrangement of §3.7. A period with
 * no entries shows one empty state in place of the period cards, while the
 * balances, budgets and upcoming cards stay (DSH-13). Privacy mode masks every
 * amount (DSH-09). Skeletons show on the first load only (NFR-01).
 */
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    BalancesCard,
    Breadcrumb,
    BudgetsCard,
    Button,
    Card,
    DateInput,
    EmptyState,
    Icon,
    LargestCard,
    RecentCard,
    SegmentedControl,
    Skeleton,
    SpendingCard,
    SummaryCards,
    TrendCard,
    UpcomingCard,
  ],
  providers: [DashboardStore],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  protected readonly store = inject(DashboardStore);
  protected readonly layout = this.store.layout;
  protected readonly breakpoints = inject(BreakpointService);
  private readonly sheets = inject(SheetService);
  private readonly transactions = inject(TransactionActions);

  protected readonly presetOptions = DASHBOARD_PRESET_OPTIONS;
  protected readonly customStart = computed(() => parseISO(this.store.custom().start));
  protected readonly customEnd = computed(() => parseISO(this.store.custom().end));

  protected setPreset(preset: unknown): void {
    if (DASHBOARD_PRESET_OPTIONS.some((o) => o.value === preset)) {
      this.store.setPreset(preset as DashboardPreset);
    }
  }

  protected setCustomDate(edge: 'start' | 'end', date: Date | null): void {
    if (!date) return;
    this.store.setCustom({ ...this.store.custom(), [edge]: format(date, 'yyyy-MM-dd') });
  }

  /** Hide and reorder cards (DSH-16). */
  protected customize(): void {
    this.sheets.open(CustomizeSheet);
  }

  protected add(): void {
    this.transactions.create().subscribe();
  }
}
