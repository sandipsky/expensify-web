import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Card } from './card';

@Component({
  imports: [Card],
  template: `
    <l-card title="Transactions" padding="md" [flush]="flush()" [hoverable]="true">
      <ul class="rows"></ul>
      <span card-footer>Load more</span>
    </l-card>
  `,
})
class Host {
  readonly flush = signal(false);
}

describe('Card', () => {
  it('runs the body edge to edge when flush, keeping the header and footer padding', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const card = (fixture.nativeElement as HTMLElement).querySelector('l-card')!;

    expect(card.classList).toContain('lui-card-pad-md');
    expect(card.classList).toContain('lui-card-hoverable');
    expect(card.classList).not.toContain('lui-card-flush');
    expect(card.querySelector('.lui-card__title')!.textContent).toBe('Transactions');
    expect(card.querySelector('.lui-card__body .rows')).not.toBeNull();
    expect(card.querySelector('.lui-card__footer')!.textContent).toBe('Load more');

    fixture.componentInstance.flush.set(true);
    fixture.detectChanges();
    expect(card.classList).toContain('lui-card-flush');
    expect(card.classList).toContain('lui-card-pad-md');
  });
});
