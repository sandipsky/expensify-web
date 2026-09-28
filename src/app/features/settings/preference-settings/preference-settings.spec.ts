import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Preferences } from '../../../core/preferences';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { DataActions } from '../data-actions';
import { PreferenceSettings } from './preference-settings';

describe('PreferenceSettings (SET-01, SET-02, SET-05, SET-06)', () => {
  const changeCurrency = vi.fn(async () => false);

  beforeEach(() => {
    localStorage.clear();
    changeCurrency.mockClear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 27, 10));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
        { provide: DataActions, useValue: { changeCurrency } },
      ],
    });
    TestBed.inject(Preferences).save({ baseCurrency: 'USD', locale: 'en-US' });
  });

  afterEach(() => vi.useRealTimers());

  async function setup() {
    const fixture = TestBed.createComponent(PreferenceSettings);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const component = fixture.componentInstance as unknown as Record<
      string,
      (v: unknown) => unknown
    >;
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { fixture, el, component, settle };
  }

  it('shows how amounts and dates are written in the chosen locale (SET-01)', async () => {
    const { el, component, settle } = await setup();
    expect(el.textContent).toContain('Looks like $1,234,567.89 · Sep 27, 2026');

    component['setLocale']('de-DE');
    await settle();
    expect(TestBed.inject(Preferences).locale()).toBe('de-DE');
    expect(el.textContent).toContain('1.234.567,89');
    expect(el.textContent).toContain('27.09.2026');
  });

  it('offers every currency the browser formats, named', async () => {
    const { component } = await setup();
    const options = (
      component['currencyOptions'] as unknown as () => { value: string; label: string }[]
    )();
    expect(options.length).toBeGreaterThan(100);
    expect(options).toContainEqual({ value: 'NPR', label: 'NPR · Nepalese Rupee' });
  });

  it('moves the currency picker back when a switch doesn’t happen', async () => {
    const { component } = await setup();
    const currency = component['currency'] as unknown as () => string;
    await component['setCurrency']('JPY');
    expect(changeCurrency).toHaveBeenCalledWith('JPY');
    expect(currency()).toBe('USD');
  });

  it('saves the month and week start days, and shows the month they give (SET-02, SET-05)', async () => {
    const { el, component, settle } = await setup();
    expect(el.textContent).toContain('This month: September 2026');

    component['setMonthStart'](25);
    component['setWeekStart'](7);
    await settle();
    const prefs = TestBed.inject(Preferences);
    expect(prefs.monthStartDay()).toBe(25);
    expect(prefs.weekStartDay()).toBe(7);
    // Intl puts thin spaces around the range's dash.
    expect(el.textContent).toMatch(/This month: Sep 25\s–\sOct 24, 2026/);
  });

  it('saves the theme (SET-06)', async () => {
    const { component } = await setup();
    component['setTheme']('dark');
    expect(TestBed.inject(Preferences).theme()).toBe('dark');
    component['setTheme']('sepia');
    expect(TestBed.inject(Preferences).theme()).toBe('dark');
  });
});
