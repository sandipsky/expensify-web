import { format } from 'date-fns';
import { Transaction } from '../models/transaction';

/**
 * Newest first: by date, then time, then creation (§10). Entries without a time
 * sort below timed ones on the same day, and unconfirmed entries (no server
 * `createdAt` yet) count as the newest.
 */
export function compareNewestFirst(
  a: Pick<Transaction, 'date' | 'time' | 'createdAt'>,
  b: Pick<Transaction, 'date' | 'time' | 'createdAt'>,
): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  const timeA = a.time ?? '';
  const timeB = b.time ?? '';
  if (timeA !== timeB) return timeA < timeB ? 1 : -1;
  const createdA = a.createdAt?.toMillis() ?? Number.POSITIVE_INFINITY;
  const createdB = b.createdAt?.toMillis() ?? Number.POSITIVE_INFINITY;
  return createdA === createdB ? 0 : createdA < createdB ? 1 : -1;
}

/** The user's local calendar date as `YYYY-MM-DD` (BR-06). */
export function localDate(now: Date = new Date()): string {
  return format(now, 'yyyy-MM-dd');
}

/** The user's local time as `HH:mm`. */
export function localTime(now: Date = new Date()): string {
  return format(now, 'HH:mm');
}
