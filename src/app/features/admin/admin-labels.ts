import { TimestampLike } from '../../core/models/timestamp';
import { AdminUser, UserRole, UserStatus } from '../../core/models/user';
import { ChipVariant } from '../../shared/components/ui/chip';

export const STATUS_LABELS: Readonly<Record<UserStatus, string>> = {
  pending: 'Pending',
  active: 'Active',
  disabled: 'Disabled',
};

/** Budget-style traffic light: waiting, in, out (never color alone: the label says it too). */
export const STATUS_VARIANTS: Readonly<Record<UserStatus, ChipVariant>> = {
  pending: 'warn',
  active: 'success',
  disabled: 'error',
};

export const ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  user: 'User',
  admin: 'Admin',
};

/** What the list calls a user: their name, else their email. */
export function userName(user: Pick<AdminUser, 'displayName' | 'email'>): string {
  return user.displayName?.trim() || user.email || 'Unnamed user';
}

/** "28 Sep 2026", or "—" while the sign-up time hasn't reached the server. */
export function formatSignUp(createdAt: TimestampLike | null, locale: string): string {
  if (!createdAt) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    new Date(createdAt.toMillis()),
  );
}

/** A loose check before an invite is written; Firebase Auth validates properly at sign-up. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
