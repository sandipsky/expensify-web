import { Injectable, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth/auth.service';
import { InvitesRepo, inviteId } from '../../core/data/invites.repo';
import { UsersRepo } from '../../core/data/users.repo';
import { AdminUser, UserStatus } from '../../core/models/user';
import { NavBadges } from '../../layout/nav-badges';
import { NotificationService } from '../../shared/components/ui/notification';
import { looksLikeEmail, userName } from './admin-labels';

/**
 * Admin state (§3.16): every profile's access fields (ADM-03) and the invite
 * list (ADM-08), on two listeners only an admin may open. The actions change
 * `role` and `status` and nothing else (ADM-04, ADM-05, ADM-07). The shell
 * starts this store for admins, so the pending count shows on the navigation
 * from any screen.
 */
@Injectable({ providedIn: 'root' })
export class AdminStore {
  private readonly users = inject(UsersRepo);
  private readonly invites = inject(InvitesRepo);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotificationService);

  private readonly _users = toSignal(this.users.watchAll());
  private readonly _invites = toSignal(this.invites.watchAll());

  /** True until the first snapshot arrives. */
  readonly loading = computed(() => this._users() === undefined);
  /** Every profile, newest sign-up first. */
  readonly all = computed(() => this._users() ?? []);
  readonly pending = computed(() => this.all().filter((u) => u.status === 'pending'));
  readonly pendingCount = computed(() => this.pending().length);
  /** Admins who can currently act; the last one can't be demoted or disabled (ADM-05). */
  readonly adminCount = computed(
    () => this.all().filter((u) => u.role === 'admin' && u.status === 'active').length,
  );
  readonly invited = computed(() => this._invites() ?? []);

  constructor() {
    const badges = inject(NavBadges);
    effect(() => badges.pendingUsers.set(this.pendingCount()));
  }

  /** The signed-in admin's own row: shown, never changed from here (ADM-05). */
  isSelf(user: Pick<AdminUser, 'uid'>): boolean {
    return user.uid === this.auth.user()?.uid;
  }

  /** Whether taking admin or access away from this user would leave no admin (ADM-05). */
  isLastAdmin(user: AdminUser): boolean {
    return user.role === 'admin' && user.status === 'active' && this.adminCount() <= 1;
  }

  /** Lets a pending or disabled user in (ADM-04). */
  approve(user: AdminUser): void {
    this.setStatus(user, 'active', `${userName(user)} can use the app now.`);
  }

  /** Locks a user out; they land on the blocked screen within seconds (ADM-04). */
  disable(user: AdminUser): void {
    this.setStatus(user, 'disabled', `${userName(user)} can’t sign in to the app any more.`);
  }

  /** Grants the admin role (ADM-05). */
  makeAdmin(user: AdminUser): void {
    if (this.isSelf(user) || user.role === 'admin') return;
    this.users.setAccess(user.uid, { role: 'admin' });
    this.notify.success('Admin added', `${userName(user)} can now manage users.`);
  }

  /** Takes the admin role away, unless they're the last admin (ADM-05). */
  removeAdmin(user: AdminUser): void {
    if (this.isSelf(user) || user.role !== 'admin') return;
    if (this.isLastAdmin(user)) {
      this.notify.warn('Can’t remove the last admin', 'Make someone else an admin first.');
      return;
    }
    this.users.setAccess(user.uid, { role: 'user' });
    this.notify.success('Admin removed', `${userName(user)} is a regular user again.`);
  }

  /**
   * Pre-approves an email (ADM-08): a sign-up with it starts active. Resolves
   * to whether it was added; an email that already has a profile is pointed
   * at instead.
   */
  invite(email: string): boolean {
    const id = inviteId(email);
    if (!looksLikeEmail(id)) {
      this.notify.warn('That doesn’t look like an email address');
      return false;
    }
    const existing = this.all().find((u) => u.email?.toLowerCase() === id);
    if (existing) {
      this.notify.info(
        'Already signed up',
        existing.status === 'pending'
          ? `${userName(existing)} is waiting in the list above. Approve them there.`
          : `${userName(existing)} already has an account.`,
      );
      return false;
    }
    const admin = this.auth.user();
    if (!admin) return false;
    this.invites.add(id, admin.uid);
    this.notify.success('Invited', `${id} will be active as soon as they sign up.`);
    return true;
  }

  /** Withdraws an invite (ADM-08). */
  uninvite(email: string): void {
    this.invites.remove(email);
  }

  private setStatus(user: AdminUser, status: UserStatus, message: string): void {
    if (this.isSelf(user) || user.status === status) return;
    if (status !== 'active' && this.isLastAdmin(user)) {
      this.notify.warn('Can’t disable the last admin', 'Make someone else an admin first.');
      return;
    }
    this.users.setAccess(user.uid, { status });
    this.notify.success(status === 'active' ? 'Access granted' : 'Access disabled', message);
  }
}
