import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Progress, ProgressVariant } from './progress';

@Component({
  imports: [Progress],
  template: `<l-progress [value]="value()" [variant]="variant()" label="Credit used" />`,
})
class Host {
  readonly value = signal(40);
  readonly variant = signal<ProgressVariant>('accent');
}

describe('Progress', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement.querySelector('l-progress') as HTMLElement;
    const bar = () => el.querySelector<HTMLElement>('.l-progress__bar')!.style.width;
    return { fixture, host: fixture.componentInstance, el, bar };
  }

  it('is a labelled progressbar filled to the value', async () => {
    const { el, bar } = await setup();
    expect(el.getAttribute('role')).toBe('progressbar');
    expect(el.getAttribute('aria-label')).toBe('Credit used');
    expect(el.getAttribute('aria-valuenow')).toBe('40');
    expect(el.getAttribute('aria-valuemax')).toBe('100');
    expect(bar()).toBe('40%');
  });

  it('caps the bar at 100 but announces the real, rounded figure', async () => {
    const { fixture, host, el, bar } = await setup();
    host.value.set(129.6);
    host.variant.set('error');
    fixture.detectChanges();
    expect(bar()).toBe('100%');
    expect(el.getAttribute('aria-valuenow')).toBe('130');
    expect(el.getAttribute('aria-valuemax')).toBe('130');
    expect(el.getAttribute('aria-valuetext')).toBe('130%');
    expect(el.classList).toContain('l-progress--error');
  });

  it('treats negative values as empty', async () => {
    const { fixture, host, el, bar } = await setup();
    host.value.set(-5);
    fixture.detectChanges();
    expect(bar()).toBe('0%');
    expect(el.getAttribute('aria-valuenow')).toBe('0');
  });
});
