import { TimestampLike } from './timestamp';

export type TxType = 'income' | 'expense' | 'transfer';
export type TxSource = 'web' | 'android' | 'recurring' | 'import';

/** `users/{uid}/transactions/{transactionId}` (§8). `attachments` arrives in v1.1. */
export interface Transaction {
  id: string;
  type: TxType;
  /** Positive integer in minor units; `type` gives the direction (BR-02). */
  amount: number;
  currency: string;
  /** Source account. */
  accountId: string;
  /** Transfers only. */
  toAccountId?: string | null;
  /** `[accountId]` or `[accountId, toAccountId]`, for one `array-contains` query. */
  accountIds: string[];
  /** Null for transfers. */
  categoryId?: string | null;
  /** The user's local date, `YYYY-MM-DD` (BR-06). */
  date: string;
  /** `HH:mm`. */
  time?: string | null;
  payee?: string | null;
  note?: string | null;
  tags: string[];
  recurringRuleId?: string | null;
  source: TxSource;
  createdAt: TimestampLike | null;
  updatedAt: TimestampLike | null;
  /** Local only: the document has writes the server hasn't confirmed (SYN-04). */
  pending?: boolean;
}

/** What callers pass to create a transaction; the repo adds the derived and audit fields. */
export type NewTransaction = Omit<
  Transaction,
  'id' | 'accountIds' | 'source' | 'createdAt' | 'updatedAt' | 'pending'
>;
