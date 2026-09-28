import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConfirmDialog, ConfirmDialogData } from './confirm-dialog';
import { ModalService } from './modal.service';

describe('ConfirmDialog', () => {
  afterEach(() => TestBed.inject(ModalService).closeAll());

  const open = (data: ConfirmDialogData) => {
    const ref = TestBed.inject(ModalService).open<ConfirmDialog, ConfirmDialogData, boolean>(
      ConfirmDialog,
      { data, animation: 'none' },
    );
    const results: (boolean | undefined)[] = [];
    ref.afterClosed().subscribe((result) => results.push(result));
    TestBed.inject(ApplicationRef).tick();
    const panel = document.body.querySelector<HTMLElement>('.confirm-dialog')!;
    const button = (label: string) =>
      [...panel.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes(label),
      )!;
    return { panel, button, results };
  };

  it('confirms with true and cancels with false', () => {
    const { button, results } = open({ title: 'Delete?', confirmText: 'Delete' });
    button('Delete').click();
    expect(results).toEqual([true]);
  });

  it('asks for the phrase first when one is set, ignoring case and spaces', () => {
    const { panel, button, results } = open({
      title: 'Delete your account?',
      confirmText: 'Delete account',
      confirmPhrase: 'DELETE',
    });
    const input = panel.querySelector<HTMLInputElement>('input')!;
    expect(panel.textContent).toContain('Type DELETE to confirm');
    expect(button('Delete account').disabled).toBe(true);

    input.value = 'delet';
    input.dispatchEvent(new Event('input'));
    TestBed.inject(ApplicationRef).tick();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(results).toEqual([]);

    input.value = ' delete ';
    input.dispatchEvent(new Event('input'));
    TestBed.inject(ApplicationRef).tick();
    expect(button('Delete account').disabled).toBe(false);
    button('Delete account').click();
    expect(results).toEqual([true]);
  });
});
