import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AbstractControl, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { TextInput } from '../components/ui/input/text-input/text-input';

/** A custom validator that carries its own message as the error value. */
function notReserved(control: AbstractControl<string | null>) {
  return control.value === 'admin' ? { reserved: 'That name is reserved.' } : null;
}

@Component({
  imports: [ReactiveFormsModule, TextInput],
  template: `<l-text-input label="Name" [formControl]="control" />`,
})
class Host {
  readonly control = new FormControl('', [Validators.required, notReserved]);
}

describe('FormValidation', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const error = () => el.querySelector('.alert.error')?.textContent?.trim() ?? null;
    return { fixture, el, error, control: fixture.componentInstance.control };
  }

  it('marks a required field and shows the error only once the field is touched', async () => {
    const { el, error, control } = await setup();
    expect(el.querySelector('label .required-asterisk')).not.toBeNull();
    expect(error()).toBeNull();

    control.markAsTouched();
    control.updateValueAndValidity();
    expect(error()).toBe('This field is required.');
  });

  it("shows a custom validator's own message", async () => {
    const { error, control } = await setup();
    control.setValue('admin');
    control.markAsDirty();
    control.updateValueAndValidity();
    expect(error()).toBe('That name is reserved.');

    control.setValue('ada');
    expect(error()).toBeNull();
  });
});
