import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { BreakpointService } from '../../layout/breakpoint.service';
import { DrawerService } from '../components/ui/drawer';
import { ModalService } from '../components/ui/modal';
import { SheetService } from './sheet.service';

@Component({ template: '' })
class Form {}

describe('SheetService', () => {
  const phone = signal(false);
  const ref = { afterClosed: () => of('done') };
  const modals = { open: vi.fn(() => ref) };
  const drawers = { open: vi.fn(() => ref) };

  beforeEach(() => {
    vi.clearAllMocks();
    phone.set(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: ModalService, useValue: modals },
        { provide: DrawerService, useValue: drawers },
        { provide: BreakpointService, useValue: { phone } },
      ],
    });
  });

  it('opens a dialog 480px wide and at most 640px tall on tablets and desktops', () => {
    const sheets = TestBed.inject(SheetService);
    sheets.open(Form, { id: 1 }).subscribe();
    sheets.open(Form, {}, { width: '560px', maxHeight: '480px' }).subscribe();

    expect(modals.open.mock.calls.map((call) => (call as unknown[])[1])).toEqual([
      { data: { id: 1 }, width: '480px', maxHeight: '640px' },
      { data: {}, width: '560px', maxHeight: '480px' },
    ]);
    expect(drawers.open).not.toHaveBeenCalled();
  });

  it('opens a bottom sheet on phones and emits the result', () => {
    phone.set(true);
    let result: unknown;
    TestBed.inject(SheetService)
      .open(Form, { id: 1 })
      .subscribe((r) => (result = r));

    expect(drawers.open).toHaveBeenCalledWith(Form, {
      data: { id: 1 },
      position: 'bottom',
      size: 'auto',
    });
    expect(result).toBe('done');
  });
});
