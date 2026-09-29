import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { LocalDb } from '../../core/data/local-db';
import { NavBadges } from '../../layout/nav-badges';
import { NotificationService } from '../../shared/components/ui/notification';
import { AdminStore } from './admin.store';

const user = (uid: string, status: string, role = 'user', email = `${uid}@example.com`) => ({
  displayName: uid.toUpperCase(),
  email,
  role,
  status,
  createdAt: { __ts: uid.charCodeAt(0) },
});

describe('AdminStore (§3.16)', () => {
  let store: AdminStore;
  let db: LocalDb;
  const notify = {
    success: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { user: signal({ uid: 'admin', email: 'admin@example.com' }) },
        },
        { provide: NotificationService, useValue: notify },
      ],
    });
    db = TestBed.inject(LocalDb);
    await db
      .batch()
      .set('users/admin', user('admin', 'active', 'admin'))
      .set('users/p1', user('p1', 'pending'))
      .set('users/p2', user('p2', 'pending'))
      .set('users/a1', user('a1', 'active'))
      .set('users/d1', user('d1', 'disabled'))
      .commit();
    store = TestBed.inject(AdminStore);
    vi.clearAllMocks();
  });

  const data = async (uid: string) => (await db.get('users')).find((d) => d.id === uid)!.data;

  it('lists every profile with a pending count on the navigation (ADM-03)', () => {
    expect(
      store
        .all()
        .map((u) => u.uid)
        .sort(),
    ).toEqual(['a1', 'admin', 'd1', 'p1', 'p2']);
    expect(store.pendingCount()).toBe(2);
    TestBed.tick();
    expect(TestBed.inject(NavBadges).pendingUsers()).toBe(2);
  });

  it('approves, disables and re-enables users (ADM-04)', async () => {
    store.approve(store.all().find((u) => u.uid === 'p1')!);
    expect(await data('p1')).toMatchObject({ status: 'active', displayName: 'P1' });
    store.disable(store.all().find((u) => u.uid === 'a1')!);
    expect(await data('a1')).toMatchObject({ status: 'disabled' });
    store.approve(store.all().find((u) => u.uid === 'd1')!);
    expect(await data('d1')).toMatchObject({ status: 'active' });
    expect(store.pendingCount()).toBe(1);
    expect(notify.success).toHaveBeenCalledTimes(3);
  });

  it('grants and removes the admin role, never leaving no admin (ADM-05)', async () => {
    const a1 = () => store.all().find((u) => u.uid === 'a1')!;
    store.makeAdmin(a1());
    expect(await data('a1')).toMatchObject({ role: 'admin' });
    expect(store.adminCount()).toBe(2);

    store.removeAdmin(a1());
    expect(await data('a1')).toMatchObject({ role: 'user' });

    // The signed-in admin is now the only one: their own row can't be changed anyway.
    const self = store.all().find((u) => u.uid === 'admin')!;
    expect(store.isSelf(self)).toBe(true);
    expect(store.isLastAdmin(self)).toBe(true);
    store.removeAdmin(self);
    store.disable(self);
    expect(await data('admin')).toMatchObject({ role: 'admin', status: 'active' });
  });

  it('invites emails and points at people who already signed up (ADM-08)', async () => {
    expect(store.invite('not an email')).toBe(false);
    expect(notify.warn).toHaveBeenCalled();
    expect(store.invite('P1@example.com')).toBe(false);
    expect(notify.info).toHaveBeenCalledWith('Already signed up', expect.stringContaining('P1'));
    expect(store.invite('New@Example.com')).toBe(true);
    await vi.waitFor(() =>
      expect(store.invited().map((i) => i.email)).toEqual(['new@example.com']),
    );
    expect((await db.get('invites'))[0].data).toMatchObject({ createdBy: 'admin' });
    store.uninvite('new@example.com');
    await vi.waitFor(() => expect(store.invited()).toEqual([]));
  });
});
