import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NotificationService } from '../../shared/components/ui/notification';
import { AlertInbox } from './alert-inbox';
import { BrowserNotifications } from './browser-notifications';
import { AlertInput, Notifier } from './notifier';

const input: AlertInput = {
  id: 'reminder|2026-09-28',
  kind: 'reminder',
  tone: 'info',
  title: 'Time to log today’s spending',
  message: 'Nothing is logged for today yet.',
  link: '/transactions/new',
  actionLabel: 'Add',
};

describe('Notifier (NTF-01 to NTF-03, NTF-05)', () => {
  const notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
  const originalNotification = globalThis.Notification;
  let visibility: DocumentVisibilityState;
  const shown: { title: string; options: NotificationOptions; onclick?: () => void }[] = [];

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    shown.length = 0;
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: NotificationService, useValue: notify }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.Notification = originalNotification;
  });

  const grant = () => {
    class FakeNotification {
      static permission: NotificationPermission = 'granted';
      onclick?: () => void;
      constructor(title: string, options: NotificationOptions) {
        shown.push(Object.assign(this, { title, options }) as never);
      }
      close() {}
    }
    globalThis.Notification = FakeNotification as unknown as typeof Notification;
  };

  it('shows a toast while the app is in view and keeps the alert in the list', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    TestBed.inject(Notifier).deliver(input);
    expect(notify.info).toHaveBeenCalledWith(
      input.title,
      input.message,
      expect.objectContaining({ action: expect.objectContaining({ label: 'Add' }) }),
    );
    notify.info.mock.calls[0][2].action.handler();
    expect(navigate).toHaveBeenCalledWith('/transactions/new');
    expect(TestBed.inject(AlertInbox).alerts()).toEqual([
      expect.objectContaining({ id: input.id, title: input.title, read: false }),
    ]);
  });

  it('shows a system notification instead while in a background tab, if allowed', () => {
    grant();
    visibility = 'hidden';
    const open = vi.fn();
    TestBed.inject(Notifier).deliver({ ...input, open });
    expect(notify.info).not.toHaveBeenCalled();
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ title: input.title, options: { tag: input.id } });
    vi.spyOn(window, 'focus').mockImplementation(() => {});
    shown[0].onclick!();
    expect(open).toHaveBeenCalled();
  });

  it('falls back to a toast in a background tab without permission', () => {
    visibility = 'hidden';
    TestBed.inject(Notifier).deliver(input);
    expect(TestBed.inject(BrowserNotifications).permission()).not.toBe('granted');
    expect(notify.info).toHaveBeenCalledTimes(1);
  });
});
