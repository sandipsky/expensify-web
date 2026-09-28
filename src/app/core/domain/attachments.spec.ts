import { Attachment } from '../models/transaction';
import {
  MAX_ATTACHMENT_BYTES,
  attachmentKind,
  attachmentName,
  attachmentsOf,
  fitsSizeLimit,
  receiptPath,
  removedAttachments,
  sameAttachments,
  scaledSize,
} from './attachments';

const file = (path: string): Attachment => ({
  path,
  name: 'receipt.jpg',
  contentType: 'image/jpeg',
  size: 1000,
});

describe('attachments', () => {
  it('takes photos and PDFs only, a typeless PDF by its name (ATT-01)', () => {
    expect(attachmentKind('image/jpeg')).toBe('image');
    expect(attachmentKind('image/HEIC')).toBe('image');
    expect(attachmentKind('application/pdf')).toBe('pdf');
    expect(attachmentKind('', 'Invoice.PDF')).toBe('pdf');
    expect(attachmentKind('', 'notes.txt')).toBeNull();
    expect(attachmentKind('text/csv', 'a.csv')).toBeNull();
  });

  it('keeps files under 5 MB, as the storage rules do (ATT-01)', () => {
    expect(fitsSizeLimit(MAX_ATTACHMENT_BYTES - 1)).toBe(true);
    expect(fitsSizeLimit(MAX_ATTACHMENT_BYTES)).toBe(false);
    expect(fitsSizeLimit(0)).toBe(false);
  });

  it('scales the longest edge down to 1,600 px, keeping the aspect ratio (ATT-02)', () => {
    expect(scaledSize(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(scaledSize(3024, 4032)).toEqual({ width: 1200, height: 1600 });
    expect(scaledSize(1200, 800)).toEqual({ width: 1200, height: 800 });
    expect(scaledSize(20000, 10)).toEqual({ width: 1600, height: 1 });
  });

  it('stores receipts under the transaction with a random file ID (§9 storage.rules)', () => {
    expect(receiptPath('users/u1', 'tx1', 'abc', 'image/jpeg')).toBe(
      'users/u1/receipts/tx1/abc.jpg',
    );
    expect(receiptPath('users/u1', 'tx1', 'abc', 'application/pdf')).toBe(
      'users/u1/receipts/tx1/abc.pdf',
    );
  });

  it('names a receipt after the picked file, with the extension it is stored as', () => {
    expect(attachmentName('IMG_2041.HEIC', 'image/jpeg')).toBe('IMG_2041.jpg');
    expect(attachmentName('Invoice 12.pdf', 'application/pdf')).toBe('Invoice 12.pdf');
    expect(attachmentName('.jpg', 'image/jpeg')).toBe('receipt.jpg');
    expect(attachmentName('a/b\\c\u0000.png', 'image/png')).toBe('abc.png');
    expect(attachmentName('x'.repeat(300) + '.jpg', 'image/jpeg')).toHaveLength(100);
  });

  it('compares by path and finds what an edit removed', () => {
    const a = file('p/a');
    const b = file('p/b');
    expect(sameAttachments([a, b], [{ ...a, name: 'renamed.jpg' }, b])).toBe(true);
    expect(sameAttachments([a, b], [b, a])).toBe(false);
    expect(removedAttachments([a, b], [b])).toEqual([a]);
    expect(attachmentsOf([{ attachments: [a] }, {}, { attachments: [b] }])).toEqual([a, b]);
  });
});
