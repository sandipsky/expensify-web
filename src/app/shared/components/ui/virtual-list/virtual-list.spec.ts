import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { VirtualItem, VirtualList } from './virtual-list';

@Component({
  imports: [VirtualList, VirtualItem],
  template: `
    <l-virtual-list
      [items]="items()"
      [itemSize]="size"
      [overscan]="200"
      (endReached)="ends = ends + 1"
    >
      <ng-template lVirtualItem let-item let-i="index">
        <span class="row">{{ i }}:{{ item }}</span>
      </ng-template>
    </l-virtual-list>
  `,
})
class Host {
  readonly items = signal<string[]>([]);
  /** Headers are 40px, rows 50px. */
  readonly size = (item: string) => (item.startsWith('h') ? 40 : 50);
  ends = 0;
}

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

describe('VirtualList', () => {
  async function setup(items: string[]) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.items.set(items);
    await fixture.whenStable();
    await frame();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const rows = () => [...el.querySelectorAll('.row')].map((r) => r.textContent);
    const spacers = () =>
      [...el.querySelectorAll<HTMLElement>('.l-virtual-list__spacer')].map((s) => s.style.height);
    return { fixture, el, rows, spacers };
  }

  it('renders a short list whole, each item in a box of its height', async () => {
    const { el, rows, fixture } = await setup(['h1', 'a', 'b']);
    expect(rows()).toEqual(['0:h1', '1:a', '2:b']);
    const boxes = [...el.querySelectorAll<HTMLElement>('.l-virtual-list__item')];
    expect(boxes.map((b) => b.style.height)).toEqual(['40px', '50px', '50px']);
    expect(fixture.componentInstance.ends).toBe(1);
  });

  it('renders only the items near the viewport and pads the rest', async () => {
    const items = Array.from({ length: 1000 }, (_, i) => `r${i}`);
    const { rows, spacers, fixture } = await setup(items);

    // jsdom's viewport is window.innerHeight tall, plus 200px overscan below.
    const rendered = Math.ceil((window.innerHeight + 200) / 50);
    expect(rows()).toHaveLength(rendered);
    expect(rows()[0]).toBe('0:r0');
    expect(spacers()).toEqual(['0px', `${(1000 - rendered) * 50}px`]);
    expect(fixture.componentInstance.ends).toBe(0);
  });

  it('moves the window as the list scrolls', async () => {
    const items = Array.from({ length: 1000 }, (_, i) => `r${i}`);
    const { el, rows, spacers, fixture } = await setup(items);
    const host = el.querySelector<HTMLElement>('l-virtual-list')!;
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({ top: -10000 } as DOMRect);

    window.dispatchEvent(new Event('scroll'));
    await frame();
    fixture.detectChanges();

    // 10,000px down, less 200px overscan: row 196 is the first one rendered.
    expect(rows()[0]).toBe('196:r196');
    expect(spacers()[0]).toBe(`${196 * 50}px`);
  });

  it('reports the end again after more items arrive', async () => {
    const { fixture } = await setup(['a', 'b']);
    expect(fixture.componentInstance.ends).toBe(1);
    fixture.componentInstance.items.set(['a', 'b', 'c']);
    await fixture.whenStable();
    expect(fixture.componentInstance.ends).toBe(2);
  });
});
