import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { IconRegistry } from './shared/components/ui/icon/icon';

describe('App', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(async () => {
    // jsdom has no `matchMedia`; the layout's sidebar reads it on creation.
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        // jsdom can't fetch the svg files.
        { provide: IconRegistry, useValue: { load: () => Promise.resolve('') } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the router outlet inside the layout shell', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('l-layout main router-outlet')).not.toBeNull();
  });

  it('links to Accounts and Categories from the sidebar', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const links = [...(fixture.nativeElement as HTMLElement).querySelectorAll('l-sidebar nav a')];
    expect(links.map((a) => [a.getAttribute('href'), a.textContent?.trim()])).toEqual([
      ['/accounts', 'Accounts'],
      ['/categories', 'Categories'],
    ]);
  });
});
