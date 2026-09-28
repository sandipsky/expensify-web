import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Preferences } from '../../../core/preferences';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { AccountsStore } from '../../accounts/accounts.store';
import { TransactionExport } from '../../transactions/transaction-export';
import { SettingsPage } from './settings-page';

describe('SettingsPage (SET-04, §3.11)', () => {
  const originalMatchMedia = window.matchMedia;
  const exportSpy = vi.fn(async () => 3);

  beforeEach(() => {
    localStorage.clear();
    exportSpy.mockClear();
    window.matchMedia = ((query: string) => ({
      matches: query.includes('min-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 27, 10));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Preferences,
          useValue: {
            locale: signal('en-US'),
            baseCurrency: signal('USD'),
            monthStartDay: signal(1),
            weekStartDay: signal(1),
          },
        },
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
        { provide: TransactionExport, useValue: { export: exportSpy } },
      ],
    });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.useRealTimers();
  });

  async function setup() {
    const fixture = TestBed.createComponent(SettingsPage);
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance['hasData']()).not.toBeNull());
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const button = (label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('l-button button')].find((b) =>
        b.textContent?.trim().startsWith(label),
      )!;
    return { fixture, el, button };
  }

  it('exports this month as CSV unless another period or format is chosen (DAT-01)', async () => {
    const { fixture, el, button } = await setup();
    expect(el.textContent).toContain('September 2026');
    button('Export CSV').click();
    expect(exportSpy).toHaveBeenCalledWith({ start: '2026-09-01', end: '2026-09-30' }, 'csv');
    await vi.waitFor(() => expect(fixture.componentInstance['exporting']()).toBe(false));

    fixture.componentInstance['setPeriod']('all');
    fixture.componentInstance['setFormat']('xlsx');
    fixture.detectChanges();
    await fixture.whenStable();
    button('Export Excel').click();
    expect(exportSpy).toHaveBeenLastCalledWith(null, 'xlsx');
  });

  it('offers a restore only while the account is empty (DAT-04)', async () => {
    const empty = await setup();
    expect(empty.el.textContent).toContain('Choose backup file');

    TestBed.inject(AccountsStore).create({
      name: 'Cash',
      type: 'cash',
      openingBalance: 0,
      creditLimit: null,
      includeInTotal: true,
    });
    const used = await setup();
    expect(used.el.textContent).not.toContain('Choose backup file');
    expect(used.el.textContent).toContain('only be restored into an empty account');
  });

  it('opens the import and the monthly report', async () => {
    const { button } = await setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    button('Import CSV').click();
    button('Open monthly report').click();
    expect(navigate.mock.calls.map(([url]) => url)).toEqual([
      '/settings/import',
      '/reports/monthly',
    ]);
  });
});
