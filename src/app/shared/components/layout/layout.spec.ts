import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Layout } from './layout';

@Component({
  imports: [Layout],
  template: `
    <l-layout [(collapsed)]="collapsed" [(mobileOpen)]="mobileOpen">
      <nav layout-sidebar>Nav</nav>
      <span layout-header>Title</span>
      <p class="page">Page</p>
    </l-layout>
  `,
})
class Host {
  readonly collapsed = signal(false);
  readonly mobileOpen = signal(false);
}

/** jsdom has no `matchMedia`; the sidebar reads it once on creation to pick desktop or mobile. */
function setViewport(mobile: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: mobile,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

describe('Layout', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  async function setup(mobile: boolean) {
    setViewport(mobile);
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideRouter([{ path: 'next', children: [] }])],
    });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const clickMenu = async () => {
      el.querySelector<HTMLButtonElement>('.l-header__menu')!.click();
      await fixture.whenStable();
    };
    return { fixture, host: fixture.componentInstance, el, clickMenu };
  }

  it('projects sidebar, header and page content into their slots', async () => {
    const { el } = await setup(false);

    expect(el.querySelector('l-sidebar aside nav')?.textContent).toBe('Nav');
    expect(el.querySelector('l-header .l-header__content span')?.textContent).toBe('Title');
    expect(el.querySelector('main.l-layout__content .page')).not.toBeNull();
  });

  it('collapses and expands the sidebar from the header menu button on desktop', async () => {
    const { host, el, clickMenu } = await setup(false);
    const sidebar = el.querySelector('l-sidebar')!;

    await clickMenu();
    expect(host.collapsed()).toBe(true);
    expect(host.mobileOpen()).toBe(false);
    expect(sidebar.classList).toContain('l-sidebar--collapsed');

    await clickMenu();
    expect(host.collapsed()).toBe(false);
    expect(sidebar.classList).not.toContain('l-sidebar--collapsed');
  });

  it('opens the sidebar as a drawer on mobile and closes it from the backdrop', async () => {
    const { fixture, host, el, clickMenu } = await setup(true);

    await clickMenu();
    expect(host.mobileOpen()).toBe(true);
    expect(host.collapsed()).toBe(false);
    expect(el.querySelector('l-sidebar')!.classList).toContain('l-sidebar--open');

    el.querySelector<HTMLElement>('.l-sidebar__backdrop')!.click();
    await fixture.whenStable();
    expect(host.mobileOpen()).toBe(false);
    expect(el.querySelector('.l-sidebar__backdrop')).toBeNull();
  });

  it('closes the mobile drawer after navigation', async () => {
    const { fixture, host, clickMenu } = await setup(true);

    await clickMenu();
    expect(host.mobileOpen()).toBe(true);

    await TestBed.inject(Router).navigateByUrl('/next');
    await fixture.whenStable();
    expect(host.mobileOpen()).toBe(false);
  });
});
