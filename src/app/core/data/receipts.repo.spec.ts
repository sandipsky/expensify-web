import { TestBed } from '@angular/core/testing';
import { LocalBucket } from './local-bucket';
import { RECEIPT_DELETE_DELAY_MS, ReceiptsRepo } from './receipts.repo';

describe('ReceiptsRepo', () => {
  let repo: ReceiptsRepo;
  let bucket: LocalBucket;
  const photo = () => new Blob(['jpeg bytes'], { type: 'image/jpeg' });
  const exists = (path: string) =>
    bucket.download(path).then(
      () => true,
      () => false,
    );

  beforeEach(() => {
    localStorage.clear();
    repo = TestBed.inject(ReceiptsRepo);
    bucket = TestBed.inject(LocalBucket);
  });

  afterEach(() => vi.useRealTimers());

  it('stores a receipt under its transaction and lists it with name, type and size (ATT-01)', async () => {
    const attachment = await repo.upload('tx1', photo(), 'Lunch.jpg');
    expect(attachment.path).toMatch(/^users\/local\/receipts\/tx1\/[A-Za-z0-9]{20}\.jpg$/);
    expect(attachment).toMatchObject({ name: 'Lunch.jpg', contentType: 'image/jpeg', size: 10 });

    const blob = await repo.download(attachment);
    expect(blob.type).toBe('image/jpeg');
    expect(await blob.text()).toBe('jpeg bytes');
  });

  it('deletes files, and treats a missing one as gone', async () => {
    const a = await repo.upload('tx1', photo(), 'a.jpg');
    repo.delete([a, { ...a, path: 'users/local/receipts/tx1/missing.jpg' }]);
    await vi.waitFor(async () => expect(await exists(a.path)).toBe(false));
  });

  it('keeps a deleted transaction’s receipts through its Undo, then deletes them (ATT-05)', async () => {
    const a = await repo.upload('tx1', photo(), 'a.jpg');
    const b = await repo.upload('tx2', photo(), 'b.jpg');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    repo.deleteLater('tx1', [a]);
    repo.deleteLater('tx2', [b]);
    repo.keep('tx2');

    vi.advanceTimersByTime(RECEIPT_DELETE_DELAY_MS - 1);
    expect(await exists(a.path)).toBe(true);
    vi.advanceTimersByTime(1);
    vi.useRealTimers();
    await vi.waitFor(async () => expect(await exists(a.path)).toBe(false));
    expect(await exists(b.path)).toBe(true);
  });

  it('deletes waiting receipts at once when the page goes away', async () => {
    const a = await repo.upload('tx1', photo(), 'a.jpg');
    repo.deleteLater('tx1', [a]);
    window.dispatchEvent(new Event('pagehide'));
    await vi.waitFor(async () => expect(await exists(a.path)).toBe(false));
  });
});
