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

@Component({
  imports: [ReactiveFormsModule, NumberInput],
  template: `<l-number-input
    label="Amount"
    [decimalPlaces]="2"
    [allowExpressions]="true"
    [formControl]="control"
    (enter)="entered = entered + 1"
  />`,
})
class ExpressionHost {
  readonly control = new FormControl<number | null>(null);
  entered = 0;
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

  describe('with allowExpressions (TXN-16)', () => {
    async function type(text: string) {
      const fixture = TestBed.createComponent(ExpressionHost);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      const input = el.querySelector('input')!;
      input.dispatchEvent(new FocusEvent('focus'));
      input.value = text;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const result = () => el.querySelector('.l-number-input__result')!.textContent!.trim();
      return { fixture, input, result, control: fixture.componentInstance.control };
    }

    it('works out the sum as it is typed and previews it', async () => {
      const { control, result } = await type('120+45');
      expect(control.value).toBe(165);
      expect(result()).toBe('= 165.00');
    });

    it('follows precedence, parentheses and unary minus', async () => {
      expect((await type('2+3*4')).control.value).toBe(14);
      expect((await type('(2+3)*4')).control.value).toBe(20);
      expect((await type('10/4')).control.value).toBe(2.5);
      expect((await type('50-5*-2')).control.value).toBe(60);
      expect((await type('3 × 2 ÷ 4')).control.value).toBe(1.5);
    });

    it('counts an unfinished expression up to its last number', async () => {
      expect((await type('120+')).control.value).toBe(120);
      expect((await type('(3+4')).control.value).toBe(7);
    });

    it('rejects nonsense, division by zero and a negative result', async () => {
      expect((await type('3+4)')).control.value).toBeNull();
      expect((await type('1.2.3+1')).control.value).toBeNull();
      expect((await type('5/0')).control.value).toBeNull();
      expect((await type('5-10')).control.value).toBeNull();
    });

    it('shows the rounded result once left, and on Enter', async () => {
      const { fixture, input, control } = await type('19.99*3');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      fixture.detectChanges();
      expect(input.value).toBe('59.97');
      expect(fixture.componentInstance.entered).toBe(1);

      input.dispatchEvent(new FocusEvent('blur'));
      fixture.detectChanges();
      expect(control.value).toBe(59.97);
      expect(input.value).toBe('59.97');
    });

    it('lets operator keys through only when expressions are on', async () => {
      const { input } = await type('');
      const key = new KeyboardEvent('keydown', { key: '+', cancelable: true });
      input.dispatchEvent(key);
      expect(key.defaultPrevented).toBe(false);

      const plain = await setup();
      const blocked = new KeyboardEvent('keydown', { key: '+', cancelable: true });
      plain.input.dispatchEvent(blocked);
      expect(blocked.defaultPrevented).toBe(true);
    });
  });
});
