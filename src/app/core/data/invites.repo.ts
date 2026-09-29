import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { TimestampLike } from '../models/timestamp';
import { Invite } from '../models/user';
import { Db, Doc, serverTimestamp } from './db';
import { WriteErrors } from './write-errors';

const INVITES = 'invites';

/** The document ID an email is invited under: lowercase, so the rules can `exists()` it (§8). */
export function inviteId(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * `invites/{email}` (§8, ADM-08): emails an admin pre-approved, so a sign-up
 * with one starts `active` instead of `pending`. Admins manage the list; a
 * signed-in user may read only their own entry, which sign-in does once.
 */
@Injectable({ providedIn: 'root' })
export class InvitesRepo {
  private readonly db = inject(Db);
  private readonly errors = inject(WriteErrors);

  /** Every invite, newest first. Admins only. */
  watchAll(): Observable<Invite[]> {
    return this.db
      .watch(INVITES, { orderBy: [['createdAt', 'desc']] })
      .pipe(map((docs) => docs.map(toInvite)));
  }

  /**
   * Whether the email was invited. False when the read fails too (offline,
   * say): a new user then starts pending and an admin can still approve them.
   */
  async isInvited(email: string | null | undefined): Promise<boolean> {
    if (!email) return false;
    try {
      return (await this.db.getDoc(`${INVITES}/${inviteId(email)}`)) !== null;
    } catch {
      return false;
    }
  }

  /** Invites the email (ADM-08). Inviting it again just refreshes the entry. */
  add(email: string, adminUid: string): void {
    const id = inviteId(email);
    this.commit((batch) =>
      batch.set(`${INVITES}/${id}`, {
        email: id,
        createdBy: adminUid,
        createdAt: serverTimestamp(),
      }),
    );
  }

  /** Withdraws the invite. A user who already signed up with it keeps their status. */
  remove(email: string): void {
    this.commit((batch) => batch.delete(`${INVITES}/${inviteId(email)}`));
  }

  // Not awaited: offline, a commit resolves only once the server confirms (§10).
  private commit(write: (batch: ReturnType<Db['batch']>) => void): void {
    const batch = this.db.batch();
    write(batch);
    batch.commit().catch((error) => this.errors.report(error));
  }
}

function toInvite(doc: Doc): Invite {
  const data = doc.data as Record<string, unknown>;
  const createdAt = data['createdAt'];
  return {
    email: typeof data['email'] === 'string' ? data['email'] : doc.id,
    createdBy: typeof data['createdBy'] === 'string' ? data['createdBy'] : '',
    createdAt:
      createdAt && typeof (createdAt as TimestampLike).toMillis === 'function'
        ? (createdAt as TimestampLike)
        : null,
  };
}
