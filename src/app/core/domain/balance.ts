// Balance effects (§4): pure functions, mirrored in Kotlin and driven by the shared test vectors.
import { TxType } from '../models/transaction';

export interface TxCore {
  type: TxType;
  amount: number;
  accountId: string;
  toAccountId?: string | null;
}

/** Signed change per account: income +amount, expense −amount, transfer −source +destination. */
export function effects(tx: TxCore): Map<string, number> {
  const m = new Map<string, number>();
  const add = (id: string, v: number) => m.set(id, (m.get(id) ?? 0) + v);
  if (tx.type === 'income') add(tx.accountId, tx.amount);
  if (tx.type === 'expense') add(tx.accountId, -tx.amount);
  if (tx.type === 'transfer') {
    add(tx.accountId, -tx.amount);
    add(tx.toAccountId!, tx.amount);
  }
  return m;
}

/** An edit: undo the old effects and apply the new ones. */
export function editEffects(before: TxCore, after: TxCore): Map<string, number> {
  const m = effects(after);
  for (const [id, v] of effects(before)) m.set(id, (m.get(id) ?? 0) - v);
  return m;
}

/** Undoing a transaction, as a delete does: its effects with the signs flipped. */
export function reverseEffects(tx: TxCore): Map<string, number> {
  const m = new Map<string, number>();
  // `|| 0` keeps -0 out of Firestore, where it would be stored as a double.
  for (const [id, v] of effects(tx)) m.set(id, -v || 0);
  return m;
}

/** Several changes as one change per account, for a bulk write in one batch (NFR-14). */
export function combineEffects(
  changes: Iterable<ReadonlyMap<string, number>>,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const change of changes) {
    for (const [id, v] of change) m.set(id, (m.get(id) ?? 0) + v);
  }
  return m;
}
