import { TimestampLike } from './timestamp';
import { TxType } from './transaction';

/** `recurringRules.frequency` values (§8). Lowercase strings shared with Android. */
export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

/** `recurringRules.endType` values (§8, REC-03). */
export const END_TYPES = ['never', 'count', 'until'] as const;
export type EndType = (typeof END_TYPES)[number];

/** `recurringRules.mode` values (§8, REC-04): create on the due date, or ask first. */
export const RULE_MODES = ['auto', 'confirm'] as const;
export type RuleMode = (typeof RULE_MODES)[number];

/** `recurringRules.template` (§8): what each occurrence is written with. */
export interface RecurringTemplate {
  type: TxType;
  /** Positive integer in minor units (BR-01, BR-02). */
  amount: number;
  accountId: string;
  /** Transfers only. */
  toAccountId?: string | null;
  /** Null for transfers. */
  categoryId?: string | null;
  payee?: string | null;
  note?: string | null;
  tags: string[];
}

/** The schedule part of a rule (REC-02), which the pure recurrence functions read. */
export interface Schedule {
  frequency: Frequency;
  /** 1 or more: "every 2 weeks" is 2. */
  interval: number;
  /** Weekly rules: ISO weekdays, 1 = Monday … 7 = Sunday. Empty for other frequencies. */
  weekdays: number[];
  /** Monthly rules: 1–31, clamped to the month's last day (BR-09). Null for other frequencies. */
  dayOfMonth: number | null;
  /** `YYYY-MM-DD`; the first occurrence is the first schedule date on or after it. */
  startDate: string;
}

/** How a rule ends (REC-03). */
export interface RuleEnd {
  endType: EndType;
  /** `until` rules: the last date an occurrence may fall on. */
  endDate: string | null;
  /** `count` rules: how many occurrences are created in all. */
  maxCount: number | null;
}

/** `users/{uid}/recurringRules/{ruleId}` (§8, v1.1). */
export interface RecurringRule extends Schedule, RuleEnd {
  id: string;
  template: RecurringTemplate;
  /** Occurrences created so far; skipped ones don't count. */
  occurrences: number;
  /** The next schedule date not yet created or skipped, `YYYY-MM-DD`. */
  nextDueDate: string;
  mode: RuleMode;
  /** False while paused (REC-07). */
  active: boolean;
  createdAt: TimestampLike | null;
  updatedAt: TimestampLike | null;
  /** Local only: the document has writes the server hasn't confirmed (SYN-04). */
  pending?: boolean;
}

/** What a new rule is written with; the repo adds the audit fields. */
export type NewRecurringRule = Omit<RecurringRule, 'id' | 'createdAt' | 'updatedAt' | 'pending'>;

/** The user-editable fields of a rule, as the form produces them. */
export interface RecurringRuleInput extends Schedule, RuleEnd {
  template: RecurringTemplate;
  mode: RuleMode;
}
