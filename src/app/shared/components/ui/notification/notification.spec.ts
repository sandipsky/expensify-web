import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  afterEach(() =>
    document.querySelectorAll('l-notification-container').forEach((el) => el.remove()),
  );

  function show(options: Parameters<NotificationService['info']>[2]) {
    TestBed.inject(NotificationService).info('Account deleted', 'Cash', options);
    TestBed.inject(ApplicationRef).tick();
  }

  it('renders no action button unless one is given', () => {
    show({ duration: 0 });
    expect(document.querySelector('l-notification')).not.toBeNull();
    expect(document.querySelector('.l-notification__action')).toBeNull();
  });

  it('runs the action once and dismisses the toast (TXN-07 Undo)', () => {
    const handler = vi.fn();
    show({ duration: 0, action: { label: 'Undo', handler } });

    const button = document.querySelector<HTMLButtonElement>('.l-notification__action')!;
    expect(button.textContent?.trim()).toBe('Undo');

    button.click();
    button.click();
    TestBed.inject(ApplicationRef).tick();

    expect(handler).toHaveBeenCalledOnce();
    expect(document.querySelector('l-notification')!.classList).toContain('is-leaving');
  });
});
