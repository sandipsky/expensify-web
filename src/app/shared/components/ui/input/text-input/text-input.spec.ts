import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Checkbox } from '../checkbox/checkbox';
import { TimeInput } from '../time-input/time-input';
import { TextInput } from './text-input';

@Component({
  imports: [ReactiveFormsModule, FormsModule, TextInput, TimeInput, Checkbox],
  template: `
    <l-text-input label="Payee" [suggestions]="payees()" [formControl]="payee" />
    <l-time-input label="Time" [formControl]="time" />
    <l-checkbox ariaLabel="Select Groceries" [ngModel]="true" />
  `,
})
class Host {
  readonly payees = signal<string[]>([]);
  readonly payee = new FormControl('');
  readonly time = new FormControl('09:30');
}

describe('text inputs', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance };
  }

  it('offers suggestions through a datalist tied to the input', async () => {
    const { fixture, el, host } = await setup();
    const input = el.querySelector<HTMLInputElement>('l-text-input input')!;
    expect(input.getAttribute('list')).toBeNull();
    expect(el.querySelector('datalist')).toBeNull();

    host.payees.set(['Fresh Mart', 'Bus pass']);
    fixture.detectChanges();
    const list = el.querySelector('datalist')!;
    expect(input.getAttribute('list')).toBe(list.id);
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect([...list.querySelectorAll('option')].map((o) => o.value)).toEqual([
      'Fresh Mart',
      'Bus pass',
    ]);
  });

  it('edits a time as HH:mm on a native time field', async () => {
    const { fixture, el, host } = await setup();
    const input = el.querySelector<HTMLInputElement>('l-time-input input')!;
    expect(input.type).toBe('time');
    expect(input.value).toBe('09:30');

    input.value = '18:05';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(host.time.value).toBe('18:05');
  });

  it('names a label-less checkbox with ariaLabel', async () => {
    const { el } = await setup();
    const box = el.querySelector<HTMLInputElement>('l-checkbox input')!;
    expect(box.getAttribute('aria-label')).toBe('Select Groceries');
  });
});
