import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Select } from './select';

@Component({
  imports: [ReactiveFormsModule, Select],
  template: `<l-select
    label="Tags"
    [items]="['travel', 'work']"
    [multiple]="true"
    [searchable]="true"
    [addTag]="lower"
    [formControl]="control"
  />`,
})
class Host {
  readonly lower = (term: string) => term.toLowerCase();
  readonly control = new FormControl<string[]>([]);
}

describe('Select', () => {
  // jsdom has no scrollIntoView, which opening the list calls on the active option.
  const scrollIntoView = Element.prototype.scrollIntoView;
  beforeAll(() => (Element.prototype.scrollIntoView = () => {}));
  afterAll(() => (Element.prototype.scrollIntoView = scrollIntoView));
  afterEach(() => document.querySelectorAll('.l-select__dropdown').forEach((d) => d.remove()));

  async function open() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLElement>('.l-select__trigger')!.click();
    fixture.detectChanges();
    await Promise.resolve();
    const search = document.querySelector<HTMLInputElement>('.l-select__search-input')!;
    const type = (text: string) => {
      search.value = text;
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const options = () =>
      [...document.querySelectorAll('.l-select__option')].map((o) => o.textContent!.trim());
    const enter = () => {
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      fixture.detectChanges();
    };
    const tags = () =>
      [...el.querySelectorAll('.l-select__tags .l-select__tag-label')].map((t) => t.textContent);
    return {
      fixture,
      search,
      type,
      options,
      enter,
      tags,
      control: fixture.componentInstance.control,
    };
  }

  describe('addTag', () => {
    it('offers the search text as a new option after the matches', async () => {
      const { type, options } = await open();
      type('Tr');
      expect(options()).toEqual(['travel', 'Add "Tr"']);
      type('work');
      expect(options()).toEqual(['work']);
    });

    it('adds the new value, transformed, and clears the search for the next one', async () => {
      const { type, enter, control, search, tags, options } = await open();
      type('Groceries');
      enter();
      expect(control.value).toEqual(['groceries']);
      expect(search.value).toBe('');
      expect(tags()).toEqual(['groceries']);

      type('GROCERIES');
      expect(options()).not.toContain('Add "GROCERIES"');
    });

    it('still picks an existing match first on Enter', async () => {
      const { type, enter, control } = await open();
      type('tra');
      enter();
      expect(control.value).toEqual(['travel']);
    });
  });
});
