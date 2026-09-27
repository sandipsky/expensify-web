import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ChartFormat, DonutSegment } from './chart';
import { DonutChart } from './donut-chart';

const FOOD: DonutSegment = { key: 'food', label: 'Food', value: 1200, color: 'var(--error)' };
const RENT: DonutSegment = { key: 'rent', label: 'Rent', value: 1800, color: 'var(--accent)' };
const FUN: DonutSegment = { key: 'fun', label: 'Fun', value: 500, color: 'var(--warn)' };
const GIFTS: DonutSegment = { key: 'gifts', label: 'Gifts', value: 0, color: 'var(--info)' };
const REFUND: DonutSegment = { key: 'refund', label: 'Refund', value: -100, color: 'var(--info)' };

@Component({
  imports: [DonutChart],
  template: `
    <l-donut-chart
      label="Expenses by category"
      [segments]="segments()"
      [format]="format"
      [selected]="selected()"
      [clickable]="clickable()"
      [legend]="legend()"
      [tableToggle]="tableToggle()"
      [(showTable)]="showTable"
      (segmentClick)="clicked.push($event)"
    >
      <strong class="total">Rs 3500</strong>
    </l-donut-chart>
  `,
})
class Host {
  readonly segments = signal<DonutSegment[]>([FOOD, RENT, FUN, GIFTS, REFUND]);
  readonly selected = signal<string | null>(null);
  readonly clickable = signal(false);
  readonly legend = signal(true);
  readonly tableToggle = signal(true);
  readonly showTable = signal(false);
  readonly format: ChartFormat = (v) => `Rs ${v}`;
  readonly clicked: DonutSegment[] = [];
}

/** The numbers of an arc path, in order: M x y A R R 0 l 1 x y L x y A r r 0 l 0 x y Z. */
const numbers = (path: Element) =>
  (path.getAttribute('d')!.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('DonutChart', () => {
  async function setup(init?: (host: Host) => void) {
    const fixture = TestBed.createComponent(Host);
    const host = fixture.componentInstance;
    init?.(host);
    await fixture.whenStable();
    const el = fixture.nativeElement.querySelector('l-donut-chart') as HTMLElement;
    const chart = fixture.debugElement.query(By.directive(DonutChart))
      .componentInstance as DonutChart;
    const all = (selector: string) => Array.from(el.querySelectorAll<HTMLElement>(selector));
    const arcs = () => all('.l-donut-chart__arc');
    const tip = () => el.querySelector<HTMLElement>('[role="tooltip"]');
    const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const cells = (row: Element) => Array.from(row.children).map(text);
    return { fixture, host, el, chart, all, arcs, tip, text, cells };
  }

  it('draws one arc per positive segment, in order, and totals the positive values', async () => {
    const { chart, arcs } = await setup();
    expect(chart.total()).toBe(3500);
    expect(arcs().map((a) => a.style.fill)).toEqual([
      'var(--error)',
      'var(--accent)',
      'var(--warn)',
    ]);
    expect(arcs().every((a) => a.getAttribute('fill-rule') === 'evenodd')).toBe(true);
  });

  it('separates neighbours with an even 2px gap, starting at 12 o’clock', async () => {
    const { arcs } = await setup();
    // size 200, thickness 28 → outer radius 100, inner 72, center (100, 100).
    const first = numbers(arcs()[0]);
    const last = numbers(arcs()[2]);
    // The first segment's leading edge is the line x = 101 at both radii (1px right of 12:00)…
    expect(first[0]).toBeCloseTo(101, 1);
    expect(first[1]).toBeCloseTo(0, 1);
    expect(first[16]).toBeCloseTo(101, 1);
    expect(first[17]).toBeCloseTo(28, 1);
    // …and the last one's trailing edge is x = 99, so the gap between them is 2px wide.
    expect(last[7]).toBeCloseTo(99, 1);
    expect(last[9]).toBeCloseTo(99, 1);
  });

  it('lists positive segments in the legend with value and whole-percent share', async () => {
    const { all, cells } = await setup();
    expect(all('.l-donut-chart__legend li').map(cells)).toEqual([
      ['', 'Food', 'Rs 1200', '34%'],
      ['', 'Rent', 'Rs 1800', '51%'],
      ['', 'Fun', 'Rs 500', '14%'],
    ]);
  });

  it('draws a single positive segment as a full ring', async () => {
    const { fixture, host, arcs, all, cells } = await setup();
    host.segments.set([FOOD, GIFTS]);
    fixture.detectChanges();
    expect(arcs()).toHaveLength(1);
    const d = arcs()[0].getAttribute('d')!;
    // Outer and inner circle as two closed subpaths; evenodd keeps the hole open.
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/Z/g)).toHaveLength(2);
    expect(all('.l-donut-chart__legend li').map(cells)).toEqual([['', 'Food', 'Rs 1200', '100%']]);
  });

  it('draws an empty track when nothing is positive', async () => {
    const { el, arcs, chart } = await setup((h) => h.segments.set([GIFTS, REFUND]));
    expect(chart.total()).toBe(0);
    expect(arcs()).toHaveLength(0);
    expect(el.querySelector('.l-donut-chart__track')).not.toBeNull();
    expect(el.querySelector('.l-donut-chart__legend')).toBeNull();
  });

  it('projects the center content', async () => {
    const { el, text } = await setup();
    expect(text(el.querySelector('.l-donut-chart__center .total'))).toBe('Rs 3500');
  });

  it('shows a tooltip and lifts the segment on hover', async () => {
    const { fixture, el, arcs, tip, text, cells } = await setup();
    expect(tip()).toBeNull();

    arcs()[1].dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(cells(tip()!.querySelector('.l-chart__tip-row')!)).toEqual(['', 'Rs 1800', 'Rent']);
    expect(text(tip()!.querySelector('.l-chart__tip-note'))).toBe('51%');
    expect(arcs().map((a) => a.classList.contains('is-dim'))).toEqual([true, false, true]);

    el.querySelector('svg')!.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(tip()).toBeNull();
    expect(arcs().some((a) => a.classList.contains('is-dim'))).toBe(false);
  });

  it('is a labelled image with inert segments when not clickable', async () => {
    const { el, host, arcs } = await setup();
    const svg = el.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Expenses by category');
    expect(arcs().some((a) => a.hasAttribute('tabindex') || a.hasAttribute('role'))).toBe(false);
    arcs()[0].dispatchEvent(new MouseEvent('click'));
    expect(host.clicked).toEqual([]);
  });

  it('makes segments focusable buttons that emit on click, Enter and Space', async () => {
    const { fixture, host, el, arcs, tip } = await setup((h) => h.clickable.set(true));
    expect(el.querySelector('svg')!.getAttribute('role')).toBe('group');
    const [food, rent] = arcs();
    expect(food.getAttribute('role')).toBe('button');
    expect(food.getAttribute('tabindex')).toBe('0');
    expect(food.getAttribute('aria-label')).toBe('Food: Rs 1200, 34%');

    rent.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(tip()).not.toBeNull();
    expect(rent.getAttribute('aria-describedby')).toBe(tip()!.id);
    expect(food.classList).toContain('is-dim');

    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    rent.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    const space = new KeyboardEvent('keydown', { key: ' ', cancelable: true });
    food.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);
    food.dispatchEvent(new MouseEvent('click'));
    expect(host.clicked).toEqual([RENT, FOOD, FOOD]);

    rent.dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
    expect(tip()).toBeNull();
    expect(rent.getAttribute('aria-describedby')).toBeNull();
  });

  it('highlights the selected segment by dimming the others', async () => {
    const { fixture, host, arcs, all } = await setup((h) => h.selected.set('fun'));
    expect(arcs().map((a) => a.classList.contains('is-dim'))).toEqual([true, true, false]);
    expect(arcs().map((a) => a.getAttribute('aria-current'))).toEqual([null, null, 'true']);
    expect(all('.l-donut-chart__legend li')[2].classList).toContain('is-on');

    // A key that is not drawn highlights nothing.
    host.selected.set('gifts');
    fixture.detectChanges();
    expect(arcs().some((a) => a.classList.contains('is-dim'))).toBe(false);
  });

  it('switches to a table of every segment with the toggle', async () => {
    const { fixture, host, el, all, text, cells } = await setup((h) => h.clickable.set(true));
    const toggle = () => el.querySelector<HTMLButtonElement>('l-chart-toggle button')!;
    expect(toggle().getAttribute('aria-pressed')).toBe('false');

    toggle().click();
    await fixture.whenStable();
    expect(host.showTable()).toBe(true);
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('svg')).toBeNull();

    expect(text(el.querySelector('caption'))).toBe('Expenses by category');
    expect(all('thead th').map(text)).toEqual(['Item', 'Amount', 'Share']);
    expect(all('tbody tr').map(cells)).toEqual([
      ['Food', 'Rs 1200', '34%'],
      ['Rent', 'Rs 1800', '51%'],
      ['Fun', 'Rs 500', '14%'],
      ['Gifts', 'Rs 0', '0%'],
      ['Refund', 'Rs -100', '0%'],
    ]);

    all('tbody .l-chart__row-btn')[1].click();
    expect(host.clicked).toEqual([RENT]);
  });

  it('can hide the legend and the table toggle', async () => {
    const { el } = await setup((h) => {
      h.legend.set(false);
      h.tableToggle.set(false);
    });
    expect(el.querySelector('.l-donut-chart__legend')).toBeNull();
    expect(el.querySelector('l-chart-toggle')).toBeNull();
    expect(el.querySelector('svg')).not.toBeNull();
  });
});
