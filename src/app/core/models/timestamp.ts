/**
 * The part of Firestore's `Timestamp` the app reads. A `serverTimestamp()` that the
 * server hasn't confirmed yet reads back as `null`, so fields typed with this are
 * nullable.
 */
export interface TimestampLike {
  toMillis(): number;
}
