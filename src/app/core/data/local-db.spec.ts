import { firstValueFrom } from 'rxjs';
import { LocalDb, LocalDoc, LocalTimestamp, increment, serverTimestamp } from './local-db';

const ids = (docs: LocalDoc[]) => docs.map((d) => d.id);

describe('LocalDb', () => {
  let db: LocalDb;

  beforeEach(() => {
    localStorage.clear();
    db = new LocalDb();
  });

  it('creates 20-character auto IDs', () => {
    expect(db.newId()).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(db.newId()).not.toBe(db.newId());
  });

  it('applies set, update and delete in one batch', async () => {
    await db.batch().set('c/a', { n: 1 }).set('c/b', { n: 2 }).commit();
    await db.batch().update('c/a', { n: 5, label: 'x' }).delete('c/b').commit();

    const docs = await db.get('c');
    expect(docs.map((d) => [d.id, d.data])).toEqual([['a', { n: 5, label: 'x' }]]);
  });

  it('applies nothing when an update targets a missing document', async () => {
    await db.batch().set('c/a', { n: 1 }).commit();
    await expect(
      db.batch().update('c/a', { n: 2 }).update('c/missing', { n: 3 }).commit(),
    ).rejects.toThrow('c/missing');
    expect((await db.get('c'))[0].data).toEqual({ n: 1 });
  });

  it('refuses to commit a batch twice', async () => {
    const batch = db.batch().set('c/a', { n: 1 });
    await batch.commit();
    await expect(batch.commit()).rejects.toThrow();
  });

  it('adds increments to the stored number, or to zero', async () => {
    await db.batch().set('c/a', { n: 10 }).commit();
    await db
      .batch()
      .update('c/a', { n: increment(-3), m: increment(4) })
      .commit();
    expect((await db.get('c'))[0].data).toEqual({ n: 7, m: 4 });
  });

  it('stamps serverTimestamp() with the commit time and drops undefined fields', async () => {
    const before = Date.now();
    await db.batch().set('c/a', { at: serverTimestamp(), skip: undefined }).commit();
    const data = (await db.get('c'))[0].data;
    expect(data['at']).toBeInstanceOf(LocalTimestamp);
    expect((data['at'] as LocalTimestamp).toMillis()).toBeGreaterThanOrEqual(before);
    expect('skip' in data).toBe(false);
  });

  it('queries one collection, not its subcollections', async () => {
    await db.batch().set('c/a', {}).set('c/a/sub/x', {}).set('other/b', {}).commit();
    expect(ids(await db.get('c'))).toEqual(['a']);
  });

  it('filters, orders (ties by ID in the last direction) and limits', async () => {
    await db
      .batch()
      .set('t/1', { date: '2026-09-01', tags: ['a'] })
      .set('t/2', { date: '2026-09-03', tags: ['a', 'b'] })
      .set('t/3', { date: '2026-09-03', tags: ['b'] })
      .set('t/4', { date: '2026-09-05', tags: ['a'] })
      .commit();

    const byDate = await db.get('t', { orderBy: [['date', 'desc']] });
    expect(ids(byDate)).toEqual(['4', '3', '2', '1']);

    const tagged = await db.get('t', {
      where: [['tags', 'array-contains', 'a']],
      orderBy: [['date', 'desc']],
      limit: 2,
    });
    expect(ids(tagged)).toEqual(['4', '2']);

    const range = await db.get('t', {
      where: [
        ['date', '>=', '2026-09-02'],
        ['date', '<=', '2026-09-04'],
      ],
      orderBy: [['date', 'asc']],
    });
    expect(ids(range)).toEqual(['2', '3']);
    expect(ids(await db.get('t', { where: [['date', '==', '2026-09-05']] }))).toEqual(['4']);
  });

  it('emits live results, and only when the result changes', async () => {
    const seen: string[][] = [];
    const sub = db.watch('c').subscribe((docs) => seen.push(ids(docs)));
    await db.batch().set('c/a', { n: 1 }).commit();
    await db.batch().set('other/x', { n: 1 }).commit();
    await db.batch().update('c/a', { n: 2 }).commit();
    sub.unsubscribe();
    expect(seen).toEqual([[], ['a'], ['a']]);
  });

  it('persists to localStorage, timestamps included', async () => {
    await db.batch().set('c/a', { n: 1, at: serverTimestamp() }).commit();
    const reloaded = await firstValueFrom(new LocalDb().watch('c'));
    expect(reloaded[0].data['n']).toBe(1);
    expect(reloaded[0].data['at']).toBeInstanceOf(LocalTimestamp);
  });

  it("picks up another tab's writes from the storage event", async () => {
    const other = new LocalDb();
    await other.batch().set('c/a', { n: 1 }).commit();
    window.dispatchEvent(new StorageEvent('storage', { key: 'expensify.local-db.v1' }));
    expect(ids(await db.get('c'))).toEqual(['a']);
  });

  it('starts empty when the stored data is unreadable', () => {
    localStorage.setItem('expensify.local-db.v1', '{not json');
    return expect(new LocalDb().get('c')).resolves.toEqual([]);
  });
});
