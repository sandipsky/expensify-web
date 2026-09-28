import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LocalBucket } from '../../../core/data/local-bucket';
import { ReceiptsRepo } from '../../../core/data/receipts.repo';
import { MAX_ATTACHMENT_BYTES } from '../../../core/domain/attachments';
import { Attachment } from '../../../core/models/transaction';
import { ReceiptDraft } from './receipt-draft';

describe('ReceiptDraft (§3.12)', () => {
  let injector: EnvironmentInjector;
  let draft: ReceiptDraft;
  let bucket: LocalBucket;
  let stored: Attachment;

  const photo = (name = 'lunch.jpg') => new File(['jpeg'], name, { type: 'image/jpeg' });
  const pdf = (name = 'bill.pdf', bytes = 3) =>
    new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
  const exists = (path: string) =>
    bucket.download(path).then(
      () => true,
      () => false,
    );

  beforeEach(async () => {
    localStorage.clear();
    bucket = TestBed.inject(LocalBucket);
    stored = await TestBed.inject(ReceiptsRepo).upload(
      'tx1',
      new Blob(['old'], { type: 'image/png' }),
      'old.png',
    );
    injector = createEnvironmentInjector([ReceiptDraft], TestBed.inject(EnvironmentInjector));
    draft = injector.get(ReceiptDraft);
    draft.start('tx1', [stored]);
  });

  afterEach(() => {
    if (!injector.destroyed) injector.destroy();
  });

  it('lists the entry’s receipts and adds photos and PDFs under its ID (ATT-01)', async () => {
    expect(draft.attachments()).toEqual([stored]);
    expect(await draft.add([photo(), pdf()])).toEqual([]);
    const [, first, second] = draft.attachments();
    expect(first).toMatchObject({ name: 'lunch.jpg', contentType: 'image/jpeg' });
    expect(second).toMatchObject({ name: 'bill.pdf', contentType: 'application/pdf', size: 3 });
    expect(first.path.startsWith('users/local/receipts/tx1/')).toBe(true);
    expect(await exists(second.path)).toBe(true);
    expect(draft.remaining()).toBe(0);
    expect(draft.uploading()).toBe(false);
  });

  it('keeps three at most, and refuses other kinds of file', async () => {
    expect(await draft.add([photo('a.jpg'), photo('b.jpg'), photo('c.jpg')])).toEqual(['count']);
    expect(draft.list().map((i) => i.name)).toEqual(['old.png', 'a.jpg', 'b.jpg']);

    draft.remove(draft.list()[2].key);
    expect(await draft.add([new File(['x'], 'notes.txt', { type: 'text/plain' })])).toEqual([
      'type',
    ]);
    expect(draft.count()).toBe(2);
  });

  it('shows a file over 5 MB as a failed tile that doesn’t count (ATT-01)', async () => {
    expect(await draft.add([pdf('big.pdf', MAX_ATTACHMENT_BYTES)])).toEqual(['size']);
    const tile = draft.list()[1];
    expect(tile).toMatchObject({ status: 'error', problem: 'size' });
    expect(draft.count()).toBe(1);
    expect(draft.attachments()).toEqual([stored]);
  });

  it('deletes a receipt added in this form as soon as it’s removed', async () => {
    await draft.add([photo()]);
    const added = draft.attachments()[1];
    draft.remove(draft.list()[1].key);
    await vi.waitFor(async () => expect(await exists(added.path)).toBe(false));
  });

  it('deletes a saved receipt the user removed only once the edit is written', async () => {
    draft.remove(stored.path);
    expect(draft.attachments()).toEqual([]);
    expect(await exists(stored.path)).toBe(true);

    draft.saved(Promise.resolve(false));
    await Promise.resolve();
    expect(await exists(stored.path)).toBe(true);

    draft.start('tx1', [stored]);
    draft.remove(stored.path);
    draft.saved(Promise.resolve(true));
    await vi.waitFor(async () => expect(await exists(stored.path)).toBe(false));
  });

  it('deletes what it uploaded when the form closes unsaved, and keeps saved receipts', async () => {
    await draft.add([photo()]);
    const added = draft.attachments()[1];
    injector.destroy();
    await vi.waitFor(async () => expect(await exists(added.path)).toBe(false));
    expect(await exists(stored.path)).toBe(true);
  });

  it('keeps uploads once saved, even when the form then starts another entry', async () => {
    await draft.add([photo()]);
    const added = draft.attachments()[1];
    draft.saved(Promise.resolve(true));
    draft.start('tx2', []);
    injector.destroy();
    await new Promise((resolve) => setTimeout(resolve));
    expect(await exists(added.path)).toBe(true);
  });
});
