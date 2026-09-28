import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TransactionsRepo } from '../../../../core/data/transactions.repo';
import { Preferences } from '../../../../core/preferences';
import { IconRegistry } from '../../../../shared/components/ui/icon/icon';
import { AccountsStore } from '../../../accounts/accounts.store';
import { CategoriesStore } from '../../../categories/categories.store';
import { ImportPage } from './import-page';

@Component({ template: '' })
class Blank {}

const BANK_CSV = [
  'Posting Date;Description;Debit;Credit',
  '25.09.2026;Corner Cafe;12,50;',
  '26.09.2026;Employer;;3.000,00',
  '27.09.2026;Broken;abc;',
].join('\n');

describe('ImportPage (DAT-02)', () => {
  const originalMatchMedia = window.matchMedia;
  let cash: string;

  beforeEach(() => {
    localStorage.clear();
    window.matchMedia = ((query: string) => ({
      matches: query.includes('min-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'transactions', component: Blank }]),
        {
          provide: Preferences,
          useValue: {
            locale: signal('en-GB'),
            baseCurrency: signal('USD'),
            monthStartDay: signal(1),
            weekStartDay: signal(1),
          },
        },
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
      ],
    });
    TestBed.inject(CategoriesStore).seedDefaults();
    cash = TestBed.inject(AccountsStore).create({
      name: 'Cash',
      type: 'cash',
      openingBalance: 0,
      creditLimit: null,
      includeInTotal: true,
    });
  });

  afterEach(() => (window.matchMedia = originalMatchMedia));

  it('walks a bank statement from file to imported entries', async () => {
    const fixture = TestBed.createComponent(ImportPage);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const button = (label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('l-button button')].find((b) =>
        b.textContent?.trim().startsWith(label),
      )!;

    // 1. File: semicolons, comma decimals and day-first dates are read as they are.
    const input = el.querySelector<HTMLInputElement>('input[type=file]')!;
    const file = new File([BANK_CSV], 'statement.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(el.textContent).toContain('3 rows.'));
    fixture.detectChanges();

    // 2. Columns: with one account, every row goes into it.
    const store = fixture.componentInstance['store'];
    expect(store.mapping()).toMatchObject({
      columns: { date: 0, payee: 1, moneyOut: 2, moneyIn: 3 },
      dateOrder: 'dmy',
      decimalSeparator: ',',
      amountMode: 'split',
      accountId: cash,
    });
    button('Review rows').click();
    await vi.waitFor(() => expect(store.checking()).toBe(false));
    fixture.detectChanges();

    // 3. Review: the broken row says why.
    expect(el.textContent).toContain('2 to import');
    expect(el.textContent).toContain('1 with problems');
    expect(el.textContent).toContain("Line 4: “abc” isn't an amount.");
    button('Import 2 transactions').click();
    fixture.detectChanges();

    // 4. Done.
    expect(el.textContent).toContain('Imported 2 transactions');
    const txs = await TestBed.inject(TransactionsRepo).listRange(null);
    expect(txs.map((t) => [t.date, t.type, t.amount, t.payee, t.source])).toEqual([
      ['2026-09-26', 'income', 300000, 'Employer', 'import'],
      ['2026-09-25', 'expense', 1250, 'Corner Cafe', 'import'],
    ]);
    expect(TestBed.inject(AccountsStore).byId(cash)!.currentBalance).toBe(300000 - 1250);

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    button('View transactions').click();
    expect(navigate).toHaveBeenCalledWith(['/transactions'], {
      queryParams: { from: '2026-09-25', to: '2026-09-26' },
    });
  });
});
