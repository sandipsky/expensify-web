import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Account } from '../../../core/models/account';
import { Preferences } from '../../../core/preferences';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { AccountCard } from './account-card';

const account = (overrides: Partial<Account> = {}): Account => ({
  id: 'a1',
  name: 'Cash',
  type: 'cash',
  currency: 'USD',
  openingBalance: 5000,
  currentBalance: 5000,
  creditLimit: null,
  icon: 'payments',
  color: '#36B37E',
  includeInTotal: true,
  archived: false,
  sortOrder: 0,
  createdAt: null,
  updatedAt: null,
  ...overrides,
});

@Component({
  imports: [AccountCard],
  template: `
    <app-account-card
      [account]="account()"
      (edit)="events.push('edit')"
      (reconcile)="events.push('reconcile')"
      (archive)="events.push('archive')"
      (restore)="events.push('restore')"
      (delete)="events.push('delete')"
    />
  `,
})
class Host {
  readonly account = signal(account());
  readonly events: string[] = [];
}

describe('AccountCard', () => {
  async function setup(overrides: Partial<Account> = {}) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Preferences,
          useValue: { locale: signal('en-US'), baseCurrency: signal('USD') },
        },
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
      ],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.account.set(account(overrides));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const text = (selector: string) => el.querySelector(selector)?.textContent?.trim();
    const openMenu = () => {
      el.querySelector<HTMLButtonElement>('l-menu l-button button')!.click();
      fixture.detectChanges();
      return [...el.querySelectorAll<HTMLButtonElement>('[dropdown-item]')];
    };
    return { fixture, host: fixture.componentInstance, el, text, openMenu };
  }

  it('shows the name as a link to the account page, the type and the balance (ACC-02)', async () => {
    const { el, text } = await setup();
    expect(el.querySelector('a')!.getAttribute('href')).toBe('/accounts/a1');
    expect(text('.account-card__link')).toBe('Cash');
    expect(text('.account-card__type')).toBe('Cash');
    expect(text('.account-card__caption')).toBe('Balance');
    expect(text('.account-card__amount')).toBe('$50.00');
    expect(el.querySelector('l-chip')).toBeNull();
  });

  it('shows a normal account below zero with its minus sign and the expense color', async () => {
    const { el, text } = await setup({ type: 'bank', currentBalance: -500 });
    expect(text('.account-card__amount')).toBe('-$5.00');
    expect(el.querySelector('.account-card__amount')!.classList).toContain('is-negative');
  });

  it('shows a credit card as the amount owed, with its credit use (ACC-08)', async () => {
    const { el, text } = await setup({
      type: 'credit_card',
      currentBalance: -32000,
      creditLimit: 100000,
    });
    expect(text('.account-card__caption')).toBe('Owed');
    expect(text('.account-card__amount')).toBe('$320.00');
    expect(el.querySelector('l-progress')!.getAttribute('aria-valuenow')).toBe('32');
    expect(text('.account-card__credit .account-card__caption')).toBe(
      '32% of $1,000.00 limit used',
    );
  });

  it('flags accounts left out of the total, and archived ones', async () => {
    const { el } = await setup({ includeInTotal: false, archived: true });
    const chips = [...el.querySelectorAll('l-chip')].map((c) => c.textContent?.trim());
    expect(chips).toEqual(['Archived', 'Not in total']);
  });

  it('offers edit, reconcile, archive and delete from its menu', async () => {
    const { host, openMenu } = await setup();
    const items = openMenu();
    expect(items.map((i) => i.textContent?.trim())).toEqual([
      'Edit',
      'Reconcile',
      'Archive',
      'Delete',
    ]);
    items[1].click();
    expect(host.events).toEqual(['reconcile']);
  });

  it('offers restore and delete for an archived account', async () => {
    const { host, openMenu } = await setup({ archived: true });
    const items = openMenu();
    expect(items.map((i) => i.textContent?.trim())).toEqual(['Restore', 'Delete']);
    items[0].click();
    expect(host.events).toEqual(['restore']);
  });
});
