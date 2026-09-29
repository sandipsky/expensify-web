import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { LocalDb } from '../../../core/data/local-db';
import { UsersRepo } from '../../../core/data/users.repo';
import { DEFAULT_CATEGORIES } from '../../../core/domain/default-categories';
import { Preferences } from '../../../core/preferences';
import { IconRegistry } from '../../../shared/components/ui/icon/icon';
import { NotificationService } from '../../../shared/components/ui/notification';
import { OnboardingPage } from './onboarding-page';

@Component({ template: '' })
class Dashboard {}

describe('OnboardingPage (§3.2)', () => {
  const originalMatchMedia = window.matchMedia;

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
        provideRouter([{ path: 'dashboard', component: Dashboard }]),
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
        {
          // The profile follows LocalDb, as the real one follows Firestore.
          provide: AuthService,
          useFactory: () => {
            const snapshot = toSignal(inject(UsersRepo).watchProfile());
            return {
              user: signal({ uid: 'local', displayName: 'Test Person' }),
              profile: computed(() => snapshot()?.profile ?? null),
            };
          },
        },
      ],
    });
    TestBed.inject(Preferences).save({ baseCurrency: 'USD', locale: 'en-US' });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  async function setup() {
    const fixture = TestBed.createComponent(OnboardingPage);
    const error = vi.spyOn(TestBed.inject(NotificationService), 'error');
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const button = (label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.trim() === label,
      )!;
    const click = async (label: string) => {
      button(label).click();
      await fixture.whenStable();
    };
    return { fixture, error, click };
  }

  async function stored(collection: string) {
    return TestBed.inject(LocalDb).get(`users/local/${collection}`);
  }

  it('skipping setup seeds the categories, marks onboarding done and opens the dashboard (ONB-03, ONB-04)', async () => {
    const { error, click } = await setup();
    await click('Skip setup for now');

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/dashboard'));
    expect(error).not.toHaveBeenCalled();
    expect(await stored('categories')).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(await stored('accounts')).toHaveLength(0);
    const profile = await TestBed.inject(LocalDb).getDoc('users/local');
    expect(profile?.data['onboardingCompleted']).toBe(true);
  });

  it('finishing writes the first account once and opens the dashboard (ONB-01, ONB-02)', async () => {
    const { error, click } = await setup();
    await click('Next');
    await click('Next');
    await click('Finish');

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/dashboard'));
    expect(error).not.toHaveBeenCalled();
    const accounts = await stored('accounts');
    expect(accounts.map((a) => a.data['name'])).toEqual(['Cash']);
    expect(await stored('categories')).toHaveLength(DEFAULT_CATEGORIES.length);
  });
});
