import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Preferences } from '../../../core/preferences';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { BrowserNotifications } from '../../notifications/browser-notifications';
import { NotificationSettings } from './notification-settings';

describe('NotificationSettings (SET-07, NTF-04)', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
      ],
    });
  });

  async function setup() {
    const fixture = TestBed.createComponent(NotificationSettings);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const component = fixture.componentInstance as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { el, component, settle };
  }

  it('turns each kind on or off, and sets the reminder time once it’s on', async () => {
    const prefs = TestBed.inject(Preferences);
    const { el, component, settle } = await setup();
    const toggles = el.querySelectorAll<HTMLInputElement>('l-toggle input[type="checkbox"]');
    expect([...toggles].map((t) => t.checked)).toEqual([false, true, true]);
    expect(el.querySelector('l-time-input')).toBeNull();

    toggles[0].click();
    await settle();
    expect(prefs.notifications().dailyReminder).toBe(true);
    expect(el.querySelector('l-time-input')).not.toBeNull();

    component['setTime']('21:15');
    component['setTime']('');
    component['setFlag']('budgetAlerts', false);
    component['setFlag']('billReminders', false);
    expect(prefs.notifications()).toEqual({
      dailyReminder: true,
      reminderTime: '21:15',
      budgetAlerts: false,
      billReminders: false,
    });
  });

  it('asks the browser for permission from the button, and says where it stands', async () => {
    const browser = TestBed.inject(BrowserNotifications);
    browser.permission.set('default');
    const request = vi.spyOn(browser, 'request').mockImplementation(async () => {
      browser.permission.set('granted');
      return 'granted';
    });
    const { el, settle } = await setup();
    const allow = [...el.querySelectorAll<HTMLButtonElement>('l-button button')].find((b) =>
      b.textContent?.includes('Allow notifications'),
    )!;
    allow.click();
    await settle();
    expect(request).toHaveBeenCalled();
    expect(el.textContent).toContain('Allowed.');

    browser.permission.set('denied');
    await settle();
    expect(el.textContent).toContain('Blocked in your browser’s settings');
  });
});
