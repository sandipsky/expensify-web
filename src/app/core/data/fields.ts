import { TimestampLike } from '../models/timestamp';

/*
 * The write-side values the repos put in documents, independent of the backend:
 * `FirestoreDb` turns them into the SDK's `FieldValue`s and `Timestamp`s when it
 * writes, and `LocalDb` applies them itself.
 */

/** Marks a field to add to; the backend turns it into its own increment. */
export class Increment {
  constructor(readonly by: number) {}
}

/** Marks a field to set to the commit time. */
export const SERVER_TIMESTAMP: unique symbol = Symbol('serverTimestamp');

/** A fixed time, as a restore writes back; the backend turns it into its own timestamp. */
export class MillisTimestamp implements TimestampLike {
  constructor(private readonly ms: number) {}

  toMillis(): number {
    return this.ms;
  }

  toJSON(): { __ts: number } {
    return { __ts: this.ms };
  }
}

/** Like Firestore's `increment()`: adds to the stored number (or to 0) when the batch applies. */
export function increment(by: number): unknown {
  return new Increment(by);
}

/** Like Firestore's `serverTimestamp()`: becomes the commit time. */
export function serverTimestamp(): unknown {
  return SERVER_TIMESTAMP;
}

/** Like Firestore's `Timestamp.fromMillis()`: a fixed time, as a restore writes back. */
export function timestampFromMillis(ms: number): TimestampLike {
  return new MillisTimestamp(ms);
}

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** A 20-character random ID, like Firestore's auto IDs; works offline. */
export function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join('');
}
