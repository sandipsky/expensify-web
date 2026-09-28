// Receipts (§3.12): pure rules for transaction attachments, mirrored in Kotlin.
// The files live in Cloud Storage under the transaction (§9 storage.rules); the
// transaction's `attachments` list says which exist (§8).
import { Attachment } from '../models/transaction';

/** Most receipts on one transaction (ATT-01). */
export const MAX_ATTACHMENTS = 3;
/** Files must be smaller than this, after compression (ATT-01, storage.rules `size < 5 MB`). */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
/** Photos are scaled down so their longest edge is at most this many pixels (ATT-02). */
export const MAX_IMAGE_EDGE = 1600;
/** Longest file name kept for display and download. */
export const MAX_ATTACHMENT_NAME = 100;
/** What the file picker offers: photos and PDFs (ATT-01). */
export const ATTACHMENT_ACCEPT = 'image/*,application/pdf,.pdf';

export type AttachmentKind = 'image' | 'pdf';

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

/**
 * Whether a file can be a receipt, and which kind. Some systems send PDFs
 * without a type, so the name decides then. Storage rules accept `image/*` and
 * `application/pdf` only.
 */
export function attachmentKind(contentType: string, name = ''): AttachmentKind | null {
  const type = contentType.toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type === 'application/pdf') return 'pdf';
  if (!type && /\.pdf$/i.test(name)) return 'pdf';
  return null;
}

/** Whether a stored file may go up: under 5 MB (ATT-01). */
export function fitsSizeLimit(bytes: number): boolean {
  return bytes > 0 && bytes < MAX_ATTACHMENT_BYTES;
}

/**
 * The size a photo is drawn at so its longest edge is at most `maxEdge` (ATT-02),
 * keeping the aspect ratio. Smaller photos keep their size.
 */
export function scaledSize(
  width: number,
  height: number,
  maxEdge = MAX_IMAGE_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** The folder holding a transaction's receipts: `users/{uid}/receipts/{transactionId}`. */
export function receiptFolder(userPath: string, transactionId: string): string {
  return `${userPath}/receipts/${transactionId}`;
}

/**
 * Where a receipt is stored. The file part is a random ID, not the user's file
 * name, so names never clash or need escaping; the name is kept in `name`.
 */
export function receiptPath(
  userPath: string,
  transactionId: string,
  fileId: string,
  contentType: string,
): string {
  return `${receiptFolder(userPath, transactionId)}/${fileId}.${extensionFor(contentType)}`;
}

/** The usual extension for a receipt's type, `bin` for anything else. */
export function extensionFor(contentType: string): string {
  return EXTENSIONS[contentType.toLowerCase()] ?? 'bin';
}

/**
 * The name a receipt is shown and downloaded as: the picked file's name, with
 * the extension of the type it's stored as (a HEIC photo saved as JPEG becomes
 * `.jpg`), at most {@link MAX_ATTACHMENT_NAME} characters.
 */
export function attachmentName(original: string, contentType: string): string {
  const clean = original.replace(/[\u0000-\u001f\u007f/\\]/g, '').trim();
  const dot = clean.lastIndexOf('.');
  const stem = (dot >= 0 ? clean.slice(0, dot) : clean).trim() || 'receipt';
  const extension = extensionFor(contentType);
  const suffix = extension === 'bin' && dot >= 0 ? clean.slice(dot) : `.${extension}`;
  return stem.slice(0, MAX_ATTACHMENT_NAME - suffix.length) + suffix;
}

/** Same receipts in the same order, by Storage path. */
export function sameAttachments(a: readonly Attachment[], b: readonly Attachment[]): boolean {
  return a.length === b.length && a.every((item, i) => item.path === b[i].path);
}

/** Receipts in `before` that `after` no longer lists: their files can go. */
export function removedAttachments(
  before: readonly Attachment[],
  after: readonly Attachment[],
): Attachment[] {
  const kept = new Set(after.map((a) => a.path));
  return before.filter((a) => !kept.has(a.path));
}

/** Every receipt of these transactions, for deleting their files with them (ATT-05). */
export function attachmentsOf(
  txs: readonly { attachments?: readonly Attachment[] }[],
): Attachment[] {
  return txs.flatMap((tx) => tx.attachments ?? []);
}
