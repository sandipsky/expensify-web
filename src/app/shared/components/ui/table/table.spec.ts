import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Table, TableColumn, TableSort } from './table';
import { TableGroupDirective } from './table-group.directive';

interface Row {
  id: number;
  day: string;
  amount: number;
}

@Component({
  imports: [Table, TableGroupDirective],
  template: `
    <l-table
      [columns]="columns"
      [data]="rows()"
      rowKey="id"
      groupBy="day"
      [virtualScroll]="virtual()"
      [rowHeight]="40"
      [groupRowHeight]="30"
      [rowSelected]="selected"
      [(sort)]="sort"
    >
      <ng-template lTableGroup let-day let-rows="rows">{{ day }} ({{ rows.length }})</ng-template>
    </l-table>
  `,
})
class Host {
  readonly columns: TableColumn[] = [
    { key: 'id', header: 'ID' },
    { key: 'amount', header: 'Amount', sortable: true },
  ];
  readonly rows = signal<Row[]>([]);
  readonly virtual = signal(false);
  readonly sort = signal<TableSort | null>(null);
  readonly selected = (row: Row) => row.id === 2;
}

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

describe('Table', () => {
  async function setup(rows: Row[], virtual = false) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.rows.set(rows);
    fixture.componentInstance.virtual.set(virtual);
    await fixture.whenStable();
    await frame();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const body = () =>
      [...el.querySelectorAll('tbody tr:not(.l-table__spacer)')].map((tr) =>
        tr.classList.contains('l-table__group')
          ? `# ${tr.textContent!.trim()}`
          : [...tr.querySelectorAll('td')].map((td) => td.textContent!.trim()).join(' '),
      );
    return { fixture, el, body };
  }

  const three: Row[] = [
    { id: 1, day: 'Sat', amount: 30 },
    { id: 2, day: 'Sat', amount: 10 },
    { id: 3, day: 'Fri', amount: 20 },
  ];

  it('puts a header row above each run of rows with the same key', async () => {
    const { el, body } = await setup(three);
    expect(body()).toEqual(['# Sat (2)', '1 30', '2 10', '# Fri (1)', '3 20']);
    const header = el.querySelector('.l-table__group th')!;
    expect(header.getAttribute('colspan')).toBe('2');
    expect(header.getAttribute('scope')).toBe('colgroup');
  });

  it('marks the rows rowSelected picks', async () => {
    const { el } = await setup(three);
    const rows = [...el.querySelectorAll('tbody tr:not(.l-table__group)')];
    expect(rows.map((tr) => tr.classList.contains('is-selected'))).toEqual([false, true, false]);
  });

  it('drops the groups while sorted by a column', async () => {
    const { fixture, body } = await setup(three);
    fixture.componentInstance.sort.set({ key: 'amount', direction: 'asc' });
    fixture.detectChanges();
    expect(body()).toEqual(['2 10', '3 20', '1 30']);
  });

  it('renders only the rows near the viewport with virtualScroll, at fixed heights', async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => ({ id: i, day: `d${i >> 1}`, amount: i }));
    const { el, body } = await setup(rows, true);

    const rendered = body();
    expect(rendered.length).toBeGreaterThan(10);
    expect(rendered.length).toBeLessThan(100);
    expect(rendered.slice(0, 3)).toEqual(['# d0 (2)', '0 0', '1 1']);

    const [first, second] = [...el.querySelectorAll<HTMLElement>('tbody tr')];
    expect(first.style.height).toBe('30px');
    expect(second.style.height).toBe('40px');
    // 1,000 groups and 2,000 rows in all, less what's rendered, sit in the spacer below.
    const spacer = el.querySelector<HTMLElement>('.l-table__spacer td')!;
    const renderedHeight = rendered.reduce((sum, r) => sum + (r.startsWith('#') ? 30 : 40), 0);
    expect(spacer.style.height).toBe(`${1000 * 30 + 2000 * 40 - renderedHeight}px`);
  });
});
