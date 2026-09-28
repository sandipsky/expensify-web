import { ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModalService } from './modal.service';

@Component({ template: '<p>Hello</p>' })
class Content {}

describe('ModalService', () => {
  afterEach(() => TestBed.inject(ModalService).closeAll());

  const panel = () => document.body.querySelector<HTMLElement>('.modal-panel')!;
  const open = (config: Parameters<ModalService['open']>[1] = {}) => {
    TestBed.inject(ModalService).open(Content, config);
    TestBed.inject(ApplicationRef).tick();
  };

  it('caps the panel height with maxHeight, so tall content scrolls inside it', () => {
    open({ width: '560px', maxHeight: '640px' });
    expect(panel().textContent).toContain('Hello');
    expect(panel().style.width).toBe('560px');
    expect(panel().style.getPropertyValue('--modal-max-height')).toBe('640px');
  });

  it('leaves the cap to the viewport when no maxHeight is given', () => {
    open();
    expect(panel().style.getPropertyValue('--modal-max-height')).toBe('');
  });

  it('reports whether a modal is open', () => {
    const modals = TestBed.inject(ModalService);
    expect(modals.hasOpen()).toBe(false);
    const ref = modals.open(Content, { animation: 'none' });
    TestBed.inject(ApplicationRef).tick();
    expect(modals.hasOpen()).toBe(true);
    ref.close();
    expect(modals.hasOpen()).toBe(false);
  });
  it('covers the viewport edge to edge when fullscreen, whatever size was asked for', () => {
    open({ fullscreen: true, width: '560px', maxHeight: '640px' });
    expect(panel().classList).toContain('modal-panel--fullscreen');
    expect(panel().style.width).toBe('100vw');
    expect(panel().style.maxWidth).toBe('100vw');
    expect(panel().style.getPropertyValue('--modal-max-height')).toBe('100dvh');
    expect(document.body.querySelector('.modal-scroll')!.classList).toContain(
      'modal-scroll--fullscreen',
    );
  });
  it('closes only the modal on top with Escape, then the one under it', () => {
    const modals = TestBed.inject(ModalService);
    const below = modals.open(Content, { animation: 'none' });
    const above = modals.open(Content, { animation: 'none' });
    TestBed.inject(ApplicationRef).tick();
    const closed: string[] = [];
    below.afterClosed().subscribe(() => closed.push('below'));
    above.afterClosed().subscribe(() => closed.push('above'));

    const escape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    escape();
    expect(closed).toEqual(['above']);
    expect(modals.hasOpen()).toBe(true);
    escape();
    expect(closed).toEqual(['above', 'below']);
  });
});
