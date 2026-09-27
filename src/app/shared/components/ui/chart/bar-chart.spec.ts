import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BarChart } from './bar-chart';
import { BarChartGroup, ChartFormat, ChartSeries } from './chart';

const INCOME: ChartSeries = { key: 'income', label: 'Income', color: 'var(--success)' };
const EXPENSE: ChartSeries = { key: 'expense', label: 'Expense', color: 'var(--error)' };

const GROUPS: BarChartGroup[] = [
  { key: '2026-08', label: 'Aug', title: 'August 2026', values: { income: 3000, expense: 1500 } },
  { key: '2026-09', label: 'Sep', values: { income: 1000, expense: 0 }, caption: '+Rs 1k' },
  { key: '2026-10', label: 'Oct', values: { income: 500 } },
];

@Component({
  imports: [BarChart],
  template: `
    <l-bar-chart
      label="Income and expense"
      [groups]="groups()"
      [series]="series()"
      [format]="format"
      [tickFormat]="tickFormat()"
      [selected]="selected()"
      [clickable]="clickable()"
      [(showTable)]="showTable"
      [tableToggle]="tableToggle()"
      (groupClick)="clicked.push($event)"
    />
  `,
})
class Host {
  readonly groups = signal<BarChartGroup[]>(GROUPS);
  readonly series = signal<ChartSeries[]>([INCOME, EXPENSE]);
  readonly tickFormat = signal<ChartFormat | null>(null);
  readonly selected = signal<string | null>(null);
  readonly clickable = signal(false);
  readonly showTable = signal(false);
  readonly tableToggle = signal(true);
  readonly format: ChartFormat = (v) => `Rs ${v}`;
  readonly clicked: BarChartGroup[] = [];
}

describe('BarChart', () => {
  async function setup(init?: (host: Host) => void) {
    const fixture = TestBed.createComponent(Host);
    const host = fixture.componentInstance;
    init?.(host);
    await fixture.whenStable();
    const el = fixture.nativeElement.querySelector('l-bar-chart') as HTMLElement;
    const all = (selector: string) => Array.from(el.querySelectorAll<HTMLElement>(selector));
    const groups = () => all('.l-bar-chart__group');
    const heights = (group: HTMLElement) =>
      Array.from(group.querySelectorAll<HTMLElement>('.l-bar-chart__bar')).map((bar) =>
        parseFloat(bar.style.height),
      );
    const tip = () => el.querySelector<HTMLElement>('[role="tooltip"]');
    const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    return { fixture, host, el, all, groups, heights, tip, text };
  }

  it('draws bar heights as a share of the top tick, with ticks from format', async () => {
    const { all, groups, heights, text } = await setup();
    // max 3000 → ticks 0 / 1000 / 2000 / 3000
    expect(all('.l-bar-chart__axis span').map(text)).toEqual([
      'Rs 0',
      'Rs 1000',
      'Rs 2000',
      'Rs 3000',
    ]);
    expect(all('.l-bar-chart__grid span')).toHaveLength(4);
    const [aug, sep, oct] = groups();
    expect(heights(aug)).toEqual([100, 50]);
    expect(heights(sep)[0]).toBeCloseTo(33.333, 2);
    expect(heights(oct)[0]).toBeCloseTo(16.667, 2);
    expect(all('.l-bar-chart__label').map(text)).toEqual(['Aug', 'Sep', 'Oct']);
    expect(all('.l-bar-chart__caption').map(text)).toEqual(['+Rs 1k']);
  });

  it('uses tickFormat for the axis when given', async () => {
    const { all, text } = await setup((host) => host.tickFormat.set((v) => `${v / 1000}k`));
    expect(all('.l-bar-chart__axis span').map(text)).toEqual(['0k', '1k', '2k', '3k']);
  });

  it('draws no bar for zero, negative or missing values', async () => {
    const { fixture, host, groups, heights } = await setup();
    const [, sep, oct] = groups();
    expect(heights(sep)[1]).toBe(0);
    expect(heights(oct)[1]).toBe(0);

    host.groups.set([{ key: 'a', label: 'A', values: { income: 0, expense: -20 } }]);
    fixture.detectChanges();
    expect(heights(groups()[0])).toEqual([0, 0]);
  });

  it('shows a legend only for two or more series', async () => {
    const { fixture, host, el, all, text } = await setup();
    expect(all('.l-chart__legend li').map(text)).toEqual(['Income', 'Expense']);
    const swatch = el.querySelector<HTMLElement>('.l-chart__legend .l-chart__swatch')!;
    expect(swatch.style.background).toBe('var(--success)');

    host.series.set([INCOME]);
    fixture.detectChanges();
    expect(el.querySelector('.l-chart__legend')).toBeNull();
    expect(el.querySelector('l-chart-toggle')).not.toBeNull();
  });

  it('shows one tooltip listing every series on hover', async () => {
    const { fixture, el, groups, tip, text, all } = await setup();
    expect(tip()).toBeNull();

    groups()[1].dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(text(tip()!.querySelector('.l-chart__tip-title'))).toBe('Sep');
    const rows = all('.l-chart__tip-row').map((row) => Array.from(row.children).map(text));
    // Line key first, then the value, then the series label.
    expect(rows).toEqual([
      ['', 'Rs 1000', 'Income'],
      ['', 'Rs 0', 'Expense'],
    ]);
    expect(tip()!.querySelector<HTMLElement>('.l-chart__tip-key')!.style.background).toBe(
      'var(--success)',
    );
    expect(groups()[1].classList).toContain('is-active');

    groups()[0].dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(text(tip()!.querySelector('.l-chart__tip-title'))).toBe('August 2026');

    el.querySelector('.l-bar-chart__plot')!.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(tip()).toBeNull();
  });

  it('is a labelled image of non-focusable groups when not clickable', async () => {
    const { el, groups } = await setup();
    const plot = el.querySelector('.l-bar-chart__plot')!;
    expect(plot.getAttribute('role')).toBe('img');
    expect(plot.getAttribute('aria-label')).toBe('Income and expense');
    expect(groups().every((g) => g.tagName === 'DIV')).toBe(true);
    expect(el.querySelector('.l-bar-chart__plot button')).toBeNull();
  });

  it('makes each group a labelled button when clickable', async () => {
    const { fixture, host, el, groups, tip } = await setup((h) => h.clickable.set(true));
    const plot = el.querySelector('.l-bar-chart__plot')!;
    expect(plot.getAttribute('role')).toBe('group');
    const [aug, sep] = groups();
    expect(aug.tagName).toBe('BUTTON');
    expect(aug.getAttribute('type')).toBe('button');
    expect(aug.getAttribute('aria-label')).toBe('August 2026: Income Rs 3000, Expense Rs 1500');
    expect(sep.getAttribute('aria-label')).toBe('Sep: Income Rs 1000, Expense Rs 0');

    // Keyboard focus shows the same tooltip as hover, and describes the button.
    sep.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(tip()).not.toBeNull();
    expect(sep.getAttribute('aria-describedby')).toBe(tip()!.id);
    expect(aug.getAttribute('aria-describedby')).toBeNull();

    sep.dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
    expect(tip()).toBeNull();
    expect(sep.getAttribute('aria-describedby')).toBeNull();

    sep.click();
    expect(host.clicked).toEqual([GROUPS[1]]);
  });

  it('hides the tooltip on Escape', async () => {
    const { fixture, groups, tip } = await setup((h) => h.clickable.set(true));
    groups()[0].dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(tip()).not.toBeNull();
    groups()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(tip()).toBeNull();
  });

  it('does not emit groupClick when not clickable', async () => {
    const { host, groups } = await setup();
    groups()[0].click();
    expect(host.clicked).toEqual([]);
  });

  it('marks the selected group', async () => {
    const { fixture, host, groups } = await setup((h) => h.selected.set('2026-09'));
    expect(groups().map((g) => g.getAttribute('aria-current'))).toEqual([null, 'true', null]);
    expect(groups()[1].classList).toContain('is-selected');

    host.selected.set(null);
    fixture.detectChanges();
    expect(groups().some((g) => g.classList.contains('is-selected'))).toBe(false);
  });

  it('switches to an equivalent table with the toggle', async () => {
    const { fixture, host, el, all, text } = await setup((h) => {
      h.clickable.set(true);
      h.selected.set('2026-08');
    });
    const toggle = () => el.querySelector<HTMLButtonElement>('l-chart-toggle button')!;
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(el.querySelector('table')).toBeNull();

    toggle().click();
    await fixture.whenStable();
    expect(host.showTable()).toBe(true);
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('.l-bar-chart__plot')).toBeNull();

    const table = el.querySelector('table')!;
    expect(text(table.querySelector('caption'))).toBe('Income and expense');
    expect(all('thead th').map(text)).toEqual(['Item', 'Income', 'Expense']);
    expect(all('tbody tr').map((row) => Array.from(row.children).map(text))).toEqual([
      ['August 2026', 'Rs 3000', 'Rs 1500'],
      ['Sep', 'Rs 1000', 'Rs 0'],
      ['Oct', 'Rs 500', 'Rs 0'],
    ]);
    expect(all('tbody td').every((td) => td.classList.contains('l-chart__num'))).toBe(true);
    expect(all('tbody tr').map((row) => row.getAttribute('aria-current'))).toEqual([
      'true',
      null,
      null,
    ]);

    all('tbody .l-chart__row-btn')[2].click();
    expect(host.clicked).toEqual([GROUPS[2]]);

    toggle().click();
    await fixture.whenStable();
    expect(host.showTable()).toBe(false);
    expect(el.querySelector('table')).toBeNull();
  });

  it('follows showTable set from outside, with plain row headers when not clickable', async () => {
    const { el, all } = await setup((h) => h.showTable.set(true));
    expect(el.querySelector('table')).not.toBeNull();
    expect(all('tbody button')).toHaveLength(0);
  });

  it('leaves the toggle and table out when the page has a table of its own', async () => {
    const { el, host, fixture } = await setup((h) => h.tableToggle.set(false));
    expect(el.querySelector('l-chart-toggle')).toBeNull();
    expect(el.querySelector('.l-chart__legend')).not.toBeNull();
    host.showTable.set(true);
    fixture.detectChanges();
    expect(el.querySelector('table')).toBeNull();
    expect(el.querySelector('.l-bar-chart__plot')).not.toBeNull();
  });

  it('keeps the frame but draws nothing when there are no groups', async () => {
    const { el, groups } = await setup((h) => h.groups.set([]));
    expect(el.querySelector('.l-bar-chart__frame')).not.toBeNull();
    expect(el.querySelector('.l-bar-chart__axis')).toBeNull();
    expect(el.querySelector('.l-bar-chart__grid')).toBeNull();
    expect(groups()).toHaveLength(0);
  });
});
