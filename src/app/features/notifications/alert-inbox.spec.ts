import { TestBed } from '@angular/core/testing';
import { ALERT_MAX_AGE_MS, AlertInbox, AppAlert, MAX_ALERTS } from './alert-inbox';
import { NOTIFICATION_KEYS } from './device-state';

const alert = (id: string): Omit<AppAlert, 'at' | 'read'> => ({
  id,
  kind: 'budget',
  tone: 'warn',
  title: `Alert ${id}`,
  message: '',
  link: null,
});

describe('AlertInbox (NTF-05)', () => {
  beforeEach(() => localStorage.clear());

  it('keeps alerts newest first, and an alert raised again moves to the top unread', () => {
    const inbox = TestBed.inject(AlertInbox);
    const now = Date.now();
    inbox.add(alert('a'), now - 2000);
    inbox.add(alert('b'), now - 1000);
    expect(inbox.alerts().map((a) => a.id)).toEqual(['b', 'a']);
    expect(inbox.unread()).toBe(2);

    inbox.markAllRead();
    expect(inbox.unread()).toBe(0);
    inbox.add(alert('a'), now);
    expect(inbox.alerts().map((a) => [a.id, a.read])).toEqual([
      ['a', false],
      ['b', true],
    ]);

    inbox.remove('b');
    expect(inbox.alerts().map((a) => a.id)).toEqual(['a']);
    inbox.clear();
    expect(inbox.alerts()).toEqual([]);
  });

  it('remembers alerts in this browser, at most 50 and none older than 30 days', () => {
    const now = Date.now();
    const inbox = TestBed.inject(AlertInbox);
    inbox.add(alert('old'), now - ALERT_MAX_AGE_MS - 1);
    for (let i = 0; i < MAX_ALERTS + 5; i++) inbox.add(alert(`n${i}`), now - i);
    expect(inbox.alerts()).toHaveLength(MAX_ALERTS);
    expect(inbox.alerts()[0].id).toBe('n0');

    TestBed.resetTestingModule();
    const reloaded = TestBed.inject(AlertInbox);
    expect(reloaded.alerts()).toHaveLength(MAX_ALERTS);
    expect(reloaded.alerts().some((a) => a.id === 'old')).toBe(false);
  });

  it('ignores stored entries it can’t read', () => {
    localStorage.setItem(NOTIFICATION_KEYS.alerts, JSON.stringify([{ id: 1 }, 'x', null]));
    expect(TestBed.inject(AlertInbox).alerts()).toEqual([]);
    localStorage.setItem(NOTIFICATION_KEYS.alerts, '{broken');
    TestBed.resetTestingModule();
    expect(TestBed.inject(AlertInbox).alerts()).toEqual([]);
  });

  it('follows another tab', () => {
    const inbox = TestBed.inject(AlertInbox);
    const other = [{ ...alert('x'), at: Date.now(), read: false }];
    localStorage.setItem(NOTIFICATION_KEYS.alerts, JSON.stringify(other));
    window.dispatchEvent(new StorageEvent('storage', { key: NOTIFICATION_KEYS.alerts }));
    expect(inbox.alerts().map((a) => a.id)).toEqual(['x']);
  });
});
