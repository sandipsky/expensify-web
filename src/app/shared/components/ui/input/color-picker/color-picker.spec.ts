import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { IconRegistry } from '../../icon/icon';
import { ColorPicker } from './color-picker';

@Component({
  imports: [ReactiveFormsModule, ColorPicker],
  template: `<l-color-picker label="Color" [options]="options" [formControl]="control" />`,
})
class Host {
  readonly options = [
    { label: 'Red', value: '#DC2626' },
    { label: 'Blue', value: '#2456E6' },
    { label: 'Gray', value: '#64748B', disabled: true },
  ];
  readonly control = new FormControl<string | null>('#2456E6', Validators.required);
}

describe('ColorPicker', () => {
  async function setup() {
    TestBed.configureTestingModule({
      providers: [{ provide: IconRegistry, useValue: { load: () => Promise.resolve('') } }],
    });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const radios = [...el.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    return { fixture, el, radios, control: fixture.componentInstance.control };
  }

  it('renders a named swatch per option in a labelled radio group', async () => {
    const { el, radios } = await setup();
    const group = el.querySelector('[role="radiogroup"]')!;
    const label = el.querySelector(`#${group.getAttribute('aria-labelledby')}`);
    expect(label?.textContent).toContain('Color');
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Red', 'Blue', 'Gray']);
    expect(radios.map((r) => r.checked)).toEqual([false, true, false]);
    expect(radios[2].disabled).toBe(true);
    const swatch = el.querySelector<HTMLElement>('.l-swatch')!;
    expect(swatch.style.getPropertyValue('--swatch-color')).toBe('#DC2626');
  });

  it('writes the chosen value to the form and marks it touched on blur', async () => {
    const { fixture, radios, control } = await setup();
    radios[0].click();
    radios[0].dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
    expect(control.value).toBe('#DC2626');
    expect(control.touched).toBe(true);
    expect(radios[0].checked).toBe(true);
  });

  it('follows the form when it changes the value', async () => {
    const { fixture, radios, control } = await setup();
    control.setValue('#DC2626');
    fixture.detectChanges();
    expect(radios.map((r) => r.checked)).toEqual([true, false, false]);
  });
});
