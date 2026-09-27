import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { format, parseISO } from 'date-fns';
import { PeriodPreset, formatPeriod, orderedRange, spanOf } from '../../../core/domain/period';
import { BreakpointService } from '../../../layout/breakpoint.service';
import { Breadcrumb } from '../../../shared/components/ui/breadcrumb';
import { Button } from '../../../shared/components/ui/button/button';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { DateInput } from '../../../shared/components/ui/input/date-input/date-input';
import { Select } from '../../../shared/components/ui/input/select/select';
import { SegmentedControl } from '../../../shared/components/ui/segmented-control';
import { Skeleton } from '../../../shared/components/ui/skeleton';
import { PERIOD_OPTIONS } from '../../transactions/transaction-labels';
import { CashFlowReport } from '../cash-flow-report/cash-flow-report';
import { CategoryReport } from '../category-report/category-report';
import { CompareReport } from '../compare-report/compare-report';
import { PayeesReport } from '../payees-report/payees-report';
import { CATEGORY_TYPE_OPTIONS, REPORT_VIEW_OPTIONS, ReportView } from '../report-labels';
import { ReportsStore } from '../reports.store';
import { TrendReport } from '../trend-report/trend-report';
import { YearReport } from '../year-report/year-report';

/**
 * `/reports` (§3.10): categories (RPT-01), the 12-month trend (RPT-02), two
 * periods compared (RPT-03), a year by month (RPT-05), cash flow per account
 * (RPT-06), and top payees with the largest expenses (RPT-07). One row of
 * controls above the report sets what it shows; every figure opens the
 * entries behind it (RPT-04). The state is in the URL, so Back from a
 * drill-down returns to the same report.
 */
@Component({
  selector: 'app-reports-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    Breadcrumb,
    Button,
    CashFlowReport,
    CategoryReport,
    CompareReport,
    DateInput,
    Icon,
    PayeesReport,
    SegmentedControl,
    Select,
    Skeleton,
    TrendReport,
    YearReport,
  ],
  providers: [ReportsStore],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.scss',
})
export class ReportsPage {
  protected readonly store = inject(ReportsStore);
  protected readonly breakpoints = inject(BreakpointService);

  protected readonly viewOptions = REPORT_VIEW_OPTIONS;
  protected readonly periodOptions = PERIOD_OPTIONS;
  protected readonly typeOptions = CATEGORY_TYPE_OPTIONS;

  /** Reports that follow the period switcher. */
  protected readonly usesPeriod = computed(() =>
    (['categories', 'accounts', 'payees'] as ReportView[]).includes(this.store.view()),
  );
  protected readonly usesType = computed(() =>
    (['categories', 'compare'] as ReportView[]).includes(this.store.view()),
  );
  protected readonly customStart = computed(() => parseISO(this.store.custom().start));
  protected readonly customEnd = computed(() => parseISO(this.store.custom().end));
  protected readonly trendLabel = computed(
    () =>
      `Last 12 months · ${formatPeriod(spanOf(this.store.trendMonths())!, this.store.locale())}`,
  );

  protected setView(view: unknown): void {
    if (REPORT_VIEW_OPTIONS.some((o) => o.value === view)) this.store.set({ view: view as string });
  }

  protected setPreset(preset: unknown): void {
    if (!PERIOD_OPTIONS.some((o) => o.value === preset)) return;
    if (preset === 'custom') {
      // Custom starts from whatever the report showed.
      const { start, end } = this.store.range();
      this.store.set({ period: preset as PeriodPreset, from: start, to: end });
    } else {
      this.store.set({ period: preset as PeriodPreset, from: null, to: null });
    }
  }

  protected setCustomDate(edge: 'start' | 'end', date: Date | null): void {
    if (!date) return;
    const custom = { ...this.store.custom(), [edge]: format(date, 'yyyy-MM-dd') };
    const { start, end } = orderedRange(custom.start, custom.end);
    this.store.set({ period: 'custom', from: start, to: end });
  }

  protected setType(type: unknown): void {
    if (type === 'expense' || type === 'income') this.store.set({ type });
  }

  protected setCompare(edge: 'a' | 'b', value: unknown): void {
    if (typeof value === 'string') this.store.set({ [edge]: value });
  }

  protected moveYear(by: number): void {
    const year = this.store.yearOffset() + by;
    this.store.set({ year: year === 0 ? null : year });
  }
}
