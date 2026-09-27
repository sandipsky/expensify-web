import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { IconRegistry } from '../../icon/icon';
import { IconPicker } from './icon-picker';

@Component({
  imports: [ReactiveFormsModule, IconPicker],
  template: `<l-icon-picker
    label="Icon"
    [color]="color()"
    [options]="options"
    [formControl]="control"
  />`,
})
class Host {
  readonly color = signal('#EA580C');
  readonly options = [
    { label: 'restaurant', value: 'restaurant' },
    { label: 'home', value: 'home' },
  ];
  readonly control = new FormControl('home');
}

describe('IconPicker', () => {
  async function setup() {
    TestBed.configureTestingModule({
      providers: [{ provide: IconRegistry, useValue: { load: () => Promise.resolve('') } }],
    });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const radios = [...el.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    const tiles = [...el.querySelectorAll('.l-icon-tile')];
    return { fixture, el, radios, tiles, host: fixture.componentInstance };
  }

  it('draws each icon as a named radio, with the chosen one marked', async () => {
    const { el, radios, tiles } = await setup();
    expect(el.querySelector('[role="radiogroup"]')).not.toBeNull();
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['restaurant', 'home']);
    expect(tiles.map((t) => t.classList.contains('is-checked'))).toEqual([false, true]);
    expect(el.querySelectorAll('l-icon')).toHaveLength(2);
  });

  it('writes the chosen icon to the form', async () => {
    const { fixture, radios, tiles, host } = await setup();
    radios[0].click();
    fixture.detectChanges();
    expect(host.control.value).toBe('restaurant');
    expect(tiles[0].classList.contains('is-checked')).toBe(true);
  });

  it('tints the chosen tile with the color input', async () => {
    const { fixture, el, host } = await setup();
    const picker = el.querySelector<HTMLElement>('l-icon-picker')!;
    expect(picker.style.getPropertyValue('--pick-color')).toBe('#EA580C');
    host.color.set('#2456E6');
    fixture.detectChanges();
    expect(picker.style.getPropertyValue('--pick-color')).toBe('#2456E6');
  });
});
