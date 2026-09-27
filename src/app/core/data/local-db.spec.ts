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

  it('watches one document until it is deleted', async () => {
    const seen: unknown[] = [];
    const sub = db.watchDoc('c/a').subscribe((doc) => seen.push(doc?.data['n'] ?? null));
    await db.batch().set('c/a', { n: 1 }).commit();
    await db.batch().set('c/b', { n: 9 }).commit();
    await db.batch().update('c/a', { n: 2 }).commit();
    await db.batch().delete('c/a').commit();
    sub.unsubscribe();
    expect(seen).toEqual([null, 1, 2, null]);
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

  it('queries and orders by paths into maps', async () => {
    await db
      .batch()
      .set('c/a', { t: { cat: 'food', n: 2 } })
      .set('c/b', { t: { cat: 'rent', n: 1 } })
      .set('c/c', { t: { cat: 'food', n: 1 } })
      .commit();
    const food = await db.get('c', {
      where: [['t.cat', '==', 'food']],
      orderBy: [['t.n', 'asc']],
    });
    expect(ids(food)).toEqual(['c', 'a']);
  });

  it("updates one field of a map with a dotted path, keeping the map's other fields", async () => {
    await db
      .batch()
      .set('c/a', { t: { cat: 'food', n: 1 }, 'x.y': 1 })
      .commit();
    await db
      .batch()
      .update('c/a', { 't.cat': 'rent', 't.n': increment(2) })
      .commit();
    const [doc] = await db.get('c');
    expect(doc.data).toEqual({ t: { cat: 'rent', n: 3 }, 'x.y': 1 });
  });

  describe('runTransaction', () => {
    it('applies its writes together and resolves to its result', async () => {
      await db.batch().set('c/a', { n: 1 }).commit();
      const result = await db.runTransaction(async (tx) => {
        const a = await tx.get('c/a');
        tx.update('c/a', { n: (a!.data['n'] as number) + 1 }).set('c/b', { n: 0 });
        return 'done';
      });
      expect(result).toBe('done');
      expect((await db.get('c')).map((d) => d.data['n'])).toEqual([2, 0]);
    });

    it('runs again when a document it read changes before it commits', async () => {
      await db.batch().set('c/a', { n: 1 }).commit();
      let runs = 0;
      await db.runTransaction(async (tx) => {
        runs++;
        const a = await tx.get('c/a');
        // Another write lands while the first run is still working.
        if (runs === 1) await db.batch().update('c/a', { n: 10 }).commit();
        tx.update('c/a', { n: (a!.data['n'] as number) + 1 });
      });
      expect(runs).toBe(2);
      expect((await db.get('c'))[0].data['n']).toBe(11);
    });

    it('treats a document created meanwhile as a change', async () => {
      let runs = 0;
      const created = await db.runTransaction(async (tx) => {
        runs++;
        const existing = await tx.get('c/once');
        if (runs === 1) await db.batch().set('c/once', { by: 'other' }).commit();
        if (existing) return false;
        tx.set('c/once', { by: 'me' });
        return true;
      });
      expect(created).toBe(false);
      expect((await db.get('c'))[0].data).toEqual({ by: 'other' });
    });

    it('applies nothing when it throws or an update misses', async () => {
      await db.batch().set('c/a', { n: 1 }).commit();
      await expect(
        db.runTransaction(async (tx) => {
          tx.update('c/a', { n: 2 });
          throw new Error('nope');
        }),
      ).rejects.toThrow('nope');
      await expect(
        db.runTransaction(async (tx) => {
          tx.update('c/a', { n: 3 }).update('c/missing', { n: 1 });
        }),
      ).rejects.toThrow('c/missing');
      expect((await db.get('c'))[0].data['n']).toBe(1);
    });
  });
});
