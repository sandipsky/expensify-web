// JSON backup (DAT-03, DAT-04, Appendix C): the file both apps write and
// restore, and the checks a file passes before anything is restored from it,
// mirrored in Kotlin. Documents keep their IDs and fields as stored (§8);
// timestamps become ISO 8601 strings.
import { CATEGORY_TYPES } from '../models/category';
import { TX_TYPES } from '../models/transaction';
import { MAX_AMOUNT } from './money';

export const BACKUP_FORMAT = 'expensify-backup';
/** The file layout's version; a restore refuses files from a newer one. */
export const BACKUP_VERSION = 1;
/** §8 `schemaVersion` of the documents inside. */
export const SCHEMA_VERSION = 1;

/** The collections under `users/{uid}` a backup holds, in the order a restore writes them. */
export const BACKUP_COLLECTIONS = [
  'categories',
  'accounts',
  'budgets',
  'transactions',
  'recurringRules',
] as const;
export type BackupCollection = (typeof BACKUP_COLLECTIONS)[number];

/** Fields Firestore stores as timestamps, written to the file as ISO 8601 strings. */
export const TIMESTAMP_FIELDS: readonly string[] = ['createdAt', 'updatedAt'];

/** A document as backed up: its ID and its fields. */
export interface BackupDoc {
  id: string;
  [field: string]: unknown;
}

/** The profile preferences that shape the data (§8 `users/{uid}`). */
export interface BackupProfile {
  baseCurrency: string;
  locale: string;
  monthStartDay: number;
  weekStartDay: number;
}

export interface Backup extends Record<BackupCollection, BackupDoc[]> {
  format: typeof BACKUP_FORMAT;
  version: number;
  schemaVersion: number;
  /** ISO 8601. */
  exportedAt: string;
  /** Which app wrote it. */
  source: 'web' | 'android';
  profile: BackupProfile;
}

export type BackupError =
  | { code: 'not_json' }
  | { code: 'not_backup' }
  | { code: 'newer_version'; version: number }
  | { code: 'invalid_document'; collection: BackupCollection; id: string }
  | { code: 'missing_account'; id: string };

export type BackupResult = { ok: true; backup: Backup } | { ok: false; error: BackupError };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isString = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);

/** Checks each kind of document enough that restoring it can't break balances or screens. */
const VALID: Readonly<Record<BackupCollection, (doc: BackupDoc) => boolean>> = {
  categories: (d) => isString(d['name']) && CATEGORY_TYPES.includes(d['type'] as never),
  accounts: (d) => isString(d['name']) && isString(d['currency']) && isInt(d['openingBalance']),
  budgets: (d) => isString(d['name']) && isInt(d['amount']) && Array.isArray(d['categoryIds']),
  transactions: (d) =>
    TX_TYPES.includes(d['type'] as never) &&
    isInt(d['amount']) &&
    (d['amount'] as number) > 0 &&
    (d['amount'] as number) <= MAX_AMOUNT &&
    isString(d['accountId']) &&
    (d['type'] !== 'transfer' || isString(d['toAccountId'])) &&
    isString(d['date']) &&
    DATE.test(d['date']),
  recurringRules: (d) =>
    !!d['template'] &&
    typeof d['template'] === 'object' &&
    isString(d['nextDueDate']) &&
    DATE.test(d['nextDueDate']),
};

/**
 * Reads a backup file. Refuses anything that isn't one, is from a newer
 * version, holds a malformed document, or has a transaction on an account the
 * file doesn't include, since restoring its balance would fail (§4).
 */
export function parseBackup(text: string): BackupResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: { code: 'not_json' } };
  }
  if (!data || typeof data !== 'object' || (data as Backup).format !== BACKUP_FORMAT) {
    return { ok: false, error: { code: 'not_backup' } };
  }
  const file = data as Partial<Backup>;
  if (!isInt(file.version) || file.version < 1) return { ok: false, error: { code: 'not_backup' } };
  if (file.version > BACKUP_VERSION) {
    return { ok: false, error: { code: 'newer_version', version: file.version } };
  }

  const collections = {} as Record<BackupCollection, BackupDoc[]>;
  for (const name of BACKUP_COLLECTIONS) {
    const docs = file[name] ?? [];
    if (!Array.isArray(docs)) return { ok: false, error: { code: 'not_backup' } };
    for (const doc of docs as BackupDoc[]) {
      const id = doc && typeof doc === 'object' ? doc.id : undefined;
      if (!isString(id) || !id || id.includes('/') || !VALID[name](doc)) {
        return {
          ok: false,
          error: { code: 'invalid_document', collection: name, id: isString(id) ? id : '' },
        };
      }
    }
    collections[name] = docs as BackupDoc[];
  }

  const accountIds = new Set(collections.accounts.map((a) => a.id));
  for (const tx of collections.transactions) {
    const ids = [tx['accountId'], tx['type'] === 'transfer' ? tx['toAccountId'] : undefined];
    if (ids.some((id) => isString(id) && !accountIds.has(id))) {
      return { ok: false, error: { code: 'missing_account', id: tx.id } };
    }
  }

  const profile = (file.profile ?? {}) as Partial<BackupProfile>;
  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: file.version,
      schemaVersion: isInt(file.schemaVersion) ? file.schemaVersion : SCHEMA_VERSION,
      exportedAt: isString(file.exportedAt) ? file.exportedAt : '',
      source: file.source === 'android' ? 'android' : 'web',
      profile: {
        baseCurrency: isString(profile.baseCurrency) ? profile.baseCurrency : '',
        locale: isString(profile.locale) ? profile.locale : '',
        monthStartDay: isInt(profile.monthStartDay) ? profile.monthStartDay : 1,
        weekStartDay: isInt(profile.weekStartDay) ? profile.weekStartDay : 1,
      },
      ...collections,
    },
  };
}

/** How many documents of each kind a backup, or an account, holds. */
export type BackupCounts = Record<BackupCollection, number>;

export function backupCounts(backup: Pick<Backup, BackupCollection>): BackupCounts {
  return Object.fromEntries(
    BACKUP_COLLECTIONS.map((name) => [name, backup[name].length]),
  ) as BackupCounts;
}

/** `expensify-backup-2026-09-28.json`, dated with the user's local date. */
export function backupFileName(localDate: string): string {
  return `${BACKUP_FORMAT}-${localDate}.json`;
}
