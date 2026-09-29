import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminUser, UserStatus } from '../../../core/models/user';
import { Preferences } from '../../../core/preferences';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { Avatar } from '../../../shared/components/ui/avatar/avatar';
import { Breadcrumb } from '../../../shared/components/ui/breadcrumb';
import { Button } from '../../../shared/components/ui/button/button';
import { Card } from '../../../shared/components/ui/card/card';
import { Chip } from '../../../shared/components/ui/chip';
import { Icon } from '../../../shared/components/ui/icon/icon';
import { EmailInput } from '../../../shared/components/ui/input/email-input/email-input';
import { Menu } from '../../../shared/components/ui/menu';
import { SegmentedControl } from '../../../shared/components/ui/segmented-control';
import { Skeleton } from '../../../shared/components/ui/skeleton';
import {
  ROLE_LABELS,
  STATUS_LABELS,
  STATUS_VARIANTS,
  formatSignUp,
  userName,
} from '../admin-labels';
import { AdminStore } from '../admin.store';

type StatusFilter = 'all' | UserStatus;

const EMPTY: Readonly<Record<StatusFilter, { title: string; message: string }>> = {
  all: { title: 'No users yet', message: 'Everyone who signs up will appear here.' },
  pending: {
    title: 'Nobody is waiting',
    message: 'New sign-ups show up here until you approve them.',
  },
  active: { title: 'No active users', message: 'Approve a pending user to let them in.' },
  disabled: { title: 'Nobody is disabled', message: 'Users you switch off are listed here.' },
};

/**
 * `/admin/users` (ADM-03 to ADM-05, ADM-08): every profile with name, email,
 * role, status and sign-up date, filterable by status; approve, disable,
 * enable, make or remove admin; and the invited emails. The admin's own row
 * can't be changed, and the last admin can't be removed.
 */
@Component({
  selector: 'app-users-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    Avatar,
    Breadcrumb,
    Button,
    Card,
    Chip,
    EmailInput,
    EmptyState,
    Icon,
    Menu,
    SegmentedControl,
    Skeleton,
  ],
  templateUrl: './users-page.html',
  styleUrl: './users-page.scss',
})
export class UsersPage {
  protected readonly store = inject(AdminStore);
  private readonly locale = inject(Preferences).locale;

  protected readonly statusLabels = STATUS_LABELS;
  protected readonly statusVariants = STATUS_VARIANTS;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly userName = userName;

  protected readonly filter = signal<StatusFilter>('all');
  protected readonly filterOptions = computed(() => {
    const count = (status: UserStatus) =>
      this.store.all().filter((u) => u.status === status).length;
    const label = (text: string, n: number) => (n ? `${text} (${n})` : text);
    return [
      { label: label('All', this.store.all().length), value: 'all' },
      { label: label('Pending', count('pending')), value: 'pending' },
      { label: label('Active', count('active')), value: 'active' },
      { label: label('Disabled', count('disabled')), value: 'disabled' },
    ];
  });
  protected readonly filtered = computed(() => {
    const filter = this.filter();
    return filter === 'all'
      ? this.store.all()
      : this.store.all().filter((u) => u.status === filter);
  });
  protected readonly empty = computed(() => EMPTY[this.filter()]);

  /** What the invite field holds. */
  protected readonly inviteEmail = signal('');

  protected setFilter(value: unknown): void {
    if (value === 'all' || value === 'pending' || value === 'active' || value === 'disabled') {
      this.filter.set(value);
    }
  }

  protected signUp(user: AdminUser): string {
    return formatSignUp(user.createdAt, this.locale());
  }

  protected invite(): void {
    if (this.store.invite(this.inviteEmail())) this.inviteEmail.set('');
  }
}
