import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Preferences } from '../../../core/preferences';
import { DrawerRef } from '../../../shared/components/ui/drawer';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { AlertInbox } from '../alert-inbox';
import { AlertsPanel } from './alerts-panel';

describe('AlertsPanel (NTF-05)', () => {
  const close = vi.fn();
  let inbox: AlertInbox;

  beforeEach(() => {
    localStorage.clear();
    close.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
        { provide: DrawerRef, useValue: { close } },
      ],
    });
    TestBed.inject(Preferences).save({ locale: 'en-US' });
    inbox = TestBed.inject(AlertInbox);
  });

  async function setup() {
    const fixture = TestBed.createComponent(AlertsPanel);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const buttons = (text: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('button')].filter((b) =>
        b.textContent?.includes(text),
      );
    return { fixture, el, buttons };
  }

  it('lists recent alerts, newest first, and marks them read', async () => {
    const now = Date.now();
    inbox.add(
      {
        id: 'a',
        kind: 'bill',
        tone: 'info',
        title: 'Rent is due tomorrow',
        message: '−$20',
        link: '/recurring',
      },
      now - 3 * 60 * 60 * 1000,
    );
    inbox.markAllRead();
    inbox.add(
      {
        id: 'b',
        kind: 'budget',
        tone: 'warn',
        title: 'Food: 86% used',
        message: '$70 left',
        link: '/budgets/x',
      },
      now - 5 * 60 * 1000,
    );
    const { el } = await setup();

    const rows = [...el.querySelectorAll('.alert-row')];
    const title = (row: Element) =>
      row.querySelector('.alert-row__title')?.textContent?.replace(/\s+/g, ' ').trim();
    expect(rows.map(title)).toEqual(['New: Food: 86% used', 'Rent is due tomorrow']);
    expect(rows[0].classList).toContain('is-fresh');
    expect(rows[1].classList).not.toContain('is-fresh');
    expect(rows[0].textContent).toContain('5 minutes ago');
    expect(rows[1].textContent).toContain('3 hours ago');
    expect(inbox.unread()).toBe(0);
  });

  it('opens an alert’s page, and removes or clears alerts', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    inbox.add({
      id: 'a',
      kind: 'budget',
      tone: 'error',
      title: 'Food: over budget',
      message: '',
      link: '/budgets/x',
    });
    inbox.add({
      id: 'b',
      kind: 'reminder',
      tone: 'info',
      title: 'Log today',
      message: '',
      link: '/transactions/new',
    });
    const { fixture, el, buttons } = await setup();

    buttons('Food: over budget')[0].click();
    expect(close).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/budgets/x');

    el.querySelector<HTMLButtonElement>('[aria-label="Remove Log today"]')!.click();
    expect(inbox.alerts().map((a) => a.id)).toEqual(['a']);

    buttons('Clear all')[0].click();
    fixture.detectChanges();
    expect(inbox.alerts()).toEqual([]);
    expect(el.textContent).toContain('No alerts yet');
  });

  it('leads to the notification settings when empty', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { buttons } = await setup();
    buttons('Notification settings')[0].click();
    expect(navigate).toHaveBeenCalledWith(['/settings'], { fragment: 'notifications' });
    expect(close).toHaveBeenCalled();
  });
});
