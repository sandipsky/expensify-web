import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NumberInput } from './number-input';

@Component({
  imports: [ReactiveFormsModule, NumberInput],
  template: `<l-number-input
    label="Amount"
    prefix="$"
    [decimalPlaces]="2"
    [formControl]="control"
  />`,
})
class Host {
  readonly control = new FormControl<number | null>(50);
}

describe('NumberInput', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    return { fixture, input, control: fixture.componentInstance.control };
  }

  it('shows the value to its decimal places, and keeps that text while focused', async () => {
    const { fixture, input } = await setup();
    expect(input.value).toBe('50.00');

    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(input.value).toBe('50.00');
  });

  it('keeps a select-all through focus, so typing replaces the value instead of appending', async () => {
    const { fixture, input, control } = await setup();
    input.select();
    input.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 5]);

    input.value = '75';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
    expect(control.value).toBe(75);
    expect(input.value).toBe('75.00');
  });

  it('rounds to its decimal places on blur', async () => {
    const { fixture, input, control } = await setup();
    input.dispatchEvent(new FocusEvent('focus'));
    input.value = '12.345';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
    expect(control.value).toBe(12.35);
    expect(input.value).toBe('12.35');
  });
});
