import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { format, parseISO } from 'date-fns';
import {
  DateRange,
  formatPeriod,
  monthPeriod,
  orderedRange,
  yearPeriod,
} from '../../../core/domain/period';
import { Preferences } from '../../../core/preferences';
import { Today } from '../../../core/today';
import { Breadcrumb } from '../../../shared/components/ui/breadcrumb';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { FileUpload, UploadFile } from '../../../shared/components/ui/file-upload';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { DateInput } from '../../../shared/components/ui/input/date-input/date-input';
import { Select } from '../../../shared/components/ui/input/select/select';
import { NotificationService } from '../../../shared/components/ui/notification';
import { SegmentedControl } from '../../../shared/components/ui/segmented-control';
import { ExportFormat, TransactionExport } from '../../transactions/transaction-export';
import { entries } from '../../transactions/transaction-labels';
import { BackupActions } from '../backup-actions';

/** What the export can cover (DAT-01): the list's periods, last year, or everything. */
type ExportPeriod = 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'all' | 'custom';

const EXPORT_PERIODS: readonly { value: ExportPeriod; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_year', label: 'This year' },
  { value: 'last_year', label: 'Last year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
];

const FORMAT_OPTIONS: readonly { value: ExportFormat; label: string }[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'xlsx', label: 'Excel' },
];

/**
 * `/settings`: for now its Data and privacy part (SET-04, §3.11): export
 * transactions as CSV or Excel for a chosen period (DAT-01, DAT-05), import a
 * CSV (DAT-02), the monthly PDF report (DAT-05), and a JSON backup with
 * restore (DAT-03, DAT-04). Profile and preferences join it in M2.
 */
@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    Breadcrumb,
    Button,
    Card,
    DateInput,
    FileUpload,
    Icon,
    SegmentedControl,
    Select,
  ],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  private readonly exporter = inject(TransactionExport);
  private readonly backups = inject(BackupActions);
  private readonly notify = inject(NotificationService);
  private readonly prefs = inject(Preferences);
  private readonly today = inject(Today).date;
  private readonly router = inject(Router);

  protected readonly periodOptions = EXPORT_PERIODS;
  protected readonly formatOptions = FORMAT_OPTIONS;

  protected readonly period = signal<ExportPeriod>('this_month');
  protected readonly format = signal<ExportFormat>('csv');
  protected readonly custom = signal<DateRange>(
    monthPeriod(this.today(), this.prefs.monthStartDay()),
  );
  protected readonly customStart = computed(() => parseISO(this.custom().start));
  protected readonly customEnd = computed(() => parseISO(this.custom().end));

  /** The export's range; null for all time. */
  protected readonly range = computed<DateRange | null>(() => {
    const today = this.today();
    const startDay = this.prefs.monthStartDay();
    switch (this.period()) {
      case 'this_month':
        return monthPeriod(today, startDay);
      case 'last_month':
        return monthPeriod(today, startDay, -1);
      case 'this_year':
        return yearPeriod(today);
      case 'last_year':
        return yearPeriod(`${Number(today.slice(0, 4)) - 1}-01-01`);
      case 'all':
        return null;
      case 'custom':
        return this.custom();
    }
  });
  protected readonly rangeLabel = computed(() => {
    const range = this.range();
    return range ? formatPeriod(range, this.prefs.locale()) : 'Every transaction you have';
  });

  protected readonly exporting = signal(false);
  /** Null until checked: restore needs an account with nothing in it (DAT-04). */
  protected readonly hasData = signal<boolean | null>(null);

  constructor() {
    void this.checkData();
  }

  protected go(url: string): void {
    void this.router.navigateByUrl(url);
  }

  protected setPeriod(value: unknown): void {
    if (EXPORT_PERIODS.some((o) => o.value === value)) this.period.set(value as ExportPeriod);
  }

  protected setFormat(value: unknown): void {
    if (value === 'csv' || value === 'xlsx') this.format.set(value);
  }

  protected setCustomDate(edge: 'start' | 'end', date: Date | null): void {
    if (!date) return;
    const next = { ...this.custom(), [edge]: format(date, 'yyyy-MM-dd') };
    this.custom.set(orderedRange(next.start, next.end));
  }

  protected async export(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      const count = await this.exporter.export(this.range(), this.format());
      if (count) this.notify.success(`Exported ${entries(count)}`, this.rangeLabel());
      else this.notify.info('Nothing to export', 'There are no transactions in that period.');
    } catch (error) {
      console.error('[export failed]', error);
      this.notify.error("Couldn't export", 'Please try again.');
    } finally {
      this.exporting.set(false);
    }
  }

  protected async backup(): Promise<void> {
    try {
      await this.backups.download();
    } catch (error) {
      console.error('[backup failed]', error);
      this.notify.error("Couldn't make the backup", 'Please try again.');
    }
  }

  protected async restore(files: UploadFile[]): Promise<void> {
    const file = files[0]?.file;
    if (!file) return;
    if (await this.backups.restore(file)) this.hasData.set(true);
  }

  private async checkData(): Promise<void> {
    this.hasData.set(await this.backups.hasData());
  }
}
