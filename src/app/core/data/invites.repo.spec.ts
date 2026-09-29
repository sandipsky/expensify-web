import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { InvitesRepo, inviteId } from './invites.repo';
import { LocalDb } from './local-db';

describe('InvitesRepo (§8 invites/{email}, ADM-08)', () => {
  let repo: InvitesRepo;
  let db: LocalDb;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    repo = TestBed.inject(InvitesRepo);
    db = TestBed.inject(LocalDb);
  });

  it('keys invites by the lowercase email, so the rules can exists() them', async () => {
    expect(inviteId('  Friend@Example.COM ')).toBe('friend@example.com');
    repo.add('Friend@Example.COM', 'admin1');
    const docs = await db.get('invites');
    expect(docs.map((d) => d.id)).toEqual(['friend@example.com']);
    expect(docs[0].data).toMatchObject({ email: 'friend@example.com', createdBy: 'admin1' });
    expect(docs[0].data['createdAt']).toBeTruthy();
  });

  it('answers whether an email was invited, ignoring case, and never throws', async () => {
    repo.add('friend@example.com', 'admin1');
    expect(await repo.isInvited('FRIEND@example.com')).toBe(true);
    expect(await repo.isInvited('other@example.com')).toBe(false);
    expect(await repo.isInvited(null)).toBe(false);
    expect(await repo.isInvited('')).toBe(false);
  });

  it('lists and withdraws invites', async () => {
    repo.add('a@example.com', 'admin1');
    repo.add('b@example.com', 'admin1');
    expect((await firstValueFrom(repo.watchAll())).map((i) => i.email).sort()).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
    repo.remove('A@example.com');
    expect((await firstValueFrom(repo.watchAll())).map((i) => i.email)).toEqual(['b@example.com']);
  });
});
