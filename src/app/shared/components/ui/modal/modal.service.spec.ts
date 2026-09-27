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
});
