import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DateInput } from './date-input';
import { L_WEEK_START } from './week-start';

describe('DateInput week start', () => {
  const render = (weekStart: number | null, fallback?: number) => {
    TestBed.configureTestingModule({
      providers: fallback ? [{ provide: L_WEEK_START, useValue: signal(fallback) }] : [],
    });
    const fixture = TestBed.createComponent(DateInput);
    fixture.componentRef.setInput('weekStart', weekStart);
    const input = fixture.componentInstance as unknown as {
      _viewYear: { set(v: number): void };
      _viewMonth: { set(v: number): void };
      _weekdays(): string[];
      _cells(): { date: Date | null }[];
    };
    // September 2026 starts on a Tuesday.
    input._viewYear.set(2026);
    input._viewMonth.set(8);
    return {
      weekdays: input._weekdays(),
      firstCell: input._cells()[0].date,
    };
  };

  it('starts weeks on Sunday by default', () => {
    const { weekdays, firstCell } = render(null);
    expect(weekdays).toEqual(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
    expect(firstCell).toEqual(new Date(2026, 7, 30));
  });

  it('starts weeks on the day given, or the one L_WEEK_START provides (SET-05)', () => {
    const monday = render(1);
    expect(monday.weekdays).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
    expect(monday.firstCell).toEqual(new Date(2026, 7, 31));

    TestBed.resetTestingModule();
    const saturday = render(null, 6);
    expect(saturday.weekdays[0]).toBe('Sa');
    expect(saturday.firstCell).toEqual(new Date(2026, 7, 29));
  });
});
