/*
 * Security Rules tests (docs/requirements.md §9, §14) on the Firestore
 * emulator: `npm run test:rules`. The active owner is allowed; other users,
 * signed-out, pending and disabled requests are denied; a user can't change
 * their own role or status; an admin can change only role and status on
 * others and can't read any subcollection; invalid documents are rejected.
 */
import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const PROJECT_ID = 'demo-expensify';

let env: RulesTestEnvironment;

type Status = 'pending' | 'active' | 'disabled';
type Role = 'user' | 'admin';

const profile = (status: Status, role: Role = 'user', email = 'someone@example.com') => ({
  displayName: 'Someone',
  email,
  role,
  status,
  baseCurrency: 'USD',
  locale: 'en-US',
  timeZone: 'UTC',
  monthStartDay: 1,
  weekStartDay: 1,
  theme: 'system',
  onboardingCompleted: false,
  notificationPrefs: { dailyReminder: false, reminderTime: '20:00' },
  schemaVersion: 1,
});

const account = () => ({
  name: 'Cash',
  type: 'cash',
  currency: 'USD',
  openingBalance: 0,
  currentBalance: 0,
  includeInTotal: true,
  archived: false,
  sortOrder: 0,
});

const expense = () => ({
  type: 'expense',
  amount: 1250,
  currency: 'USD',
  accountId: 'cash',
  accountIds: ['cash'],
  categoryId: 'exp_food',
  date: '2026-09-29',
  tags: [],
  source: 'web',
});

/** Writes documents with the rules switched off, as fixtures. */
async function seed(docs: Record<string, object>): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [path, data] of Object.entries(docs)) await setDoc(doc(db, path), data);
  });
}

const as = (uid: string, email = `${uid}@example.com`) =>
  env.authenticatedContext(uid, { email }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(() => env.cleanup());

beforeEach(() => env.clearFirestore());

describe('profiles (ADM-01, ADM-02)', () => {
  it('lets a signed-in user create their own profile as a pending user only', async () => {
    await assertSucceeds(setDoc(doc(as('u1'), 'users/u1'), profile('pending')));
    await assertFails(setDoc(doc(as('u2'), 'users/u2'), profile('active')));
    await assertFails(setDoc(doc(as('u3'), 'users/u3'), profile('pending', 'admin')));
    await assertFails(setDoc(doc(as('u4'), 'users/u5'), profile('pending')));
    await assertFails(setDoc(doc(anonymous(), 'users/u6'), profile('pending')));
  });

  it('lets an invited email start active (ADM-08)', async () => {
    await seed({ 'invites/new@example.com': { email: 'new@example.com', createdBy: 'admin' } });
    await assertSucceeds(
      setDoc(doc(as('u1', 'New@Example.com'), 'users/u1'), profile('active', 'user')),
    );
    await assertFails(setDoc(doc(as('u2', 'other@example.com'), 'users/u2'), profile('active')));
  });

  it('lets every status read its own profile, and nobody else’s', async () => {
    await seed({ 'users/u1': profile('pending'), 'users/u2': profile('disabled') });
    await assertSucceeds(getDoc(doc(as('u1'), 'users/u1')));
    await assertSucceeds(getDoc(doc(as('u2'), 'users/u2')));
    await assertFails(getDoc(doc(as('u1'), 'users/u2')));
    await assertFails(getDoc(doc(anonymous(), 'users/u1')));
    await assertFails(getDocs(collection(as('u1'), 'users')));
  });

  it('lets an active user change preferences but never their role or status', async () => {
    await seed({ 'users/u1': profile('active'), 'users/u2': profile('pending') });
    await assertSucceeds(updateDoc(doc(as('u1'), 'users/u1'), { theme: 'dark' }));
    await assertSucceeds(
      setDoc(
        doc(as('u1'), 'users/u1'),
        { notificationPrefs: { budgetAlerts: false } },
        { merge: true },
      ),
    );
    await assertFails(updateDoc(doc(as('u1'), 'users/u1'), { role: 'admin' }));
    await assertFails(updateDoc(doc(as('u1'), 'users/u1'), { status: 'disabled' }));
    await assertFails(setDoc(doc(as('u1'), 'users/u1'), profile('active', 'admin')));
    // A pending user can't even change their preferences.
    await assertFails(updateDoc(doc(as('u2'), 'users/u2'), { theme: 'dark' }));
  });

  it('lets only the active owner delete the profile', async () => {
    await seed({ 'users/u1': profile('active'), 'users/u2': profile('disabled') });
    await assertFails(deleteDoc(doc(as('u2'), 'users/u2')));
    await assertFails(deleteDoc(doc(as('u2'), 'users/u1')));
    await assertSucceeds(deleteDoc(doc(as('u1'), 'users/u1')));
  });
});

describe('financial data (ADM-02, §9)', () => {
  it('is readable and writable by the active owner only', async () => {
    await seed({
      'users/u1': profile('active'),
      'users/u2': profile('pending'),
      'users/u3': profile('disabled'),
      'users/u1/accounts/cash': account(),
      'users/u2/accounts/cash': account(),
      'users/u3/accounts/cash': account(),
    });
    await assertSucceeds(getDocs(collection(as('u1'), 'users/u1/accounts')));
    await assertSucceeds(setDoc(doc(as('u1'), 'users/u1/accounts/bank'), account()));
    await assertSucceeds(setDoc(doc(as('u1'), 'users/u1/transactions/t1'), expense()));
    await assertSucceeds(setDoc(doc(as('u1'), 'users/u1/budgets/b1'), { name: 'Food' }));

    await assertFails(getDocs(collection(as('u2'), 'users/u2/accounts')));
    await assertFails(setDoc(doc(as('u2'), 'users/u2/accounts/bank'), account()));
    await assertFails(getDocs(collection(as('u3'), 'users/u3/accounts')));
    await assertFails(setDoc(doc(as('u3'), 'users/u3/transactions/t1'), expense()));
    await assertFails(getDocs(collection(as('u1'), 'users/u2/accounts')));
    await assertFails(getDoc(doc(anonymous(), 'users/u1/accounts/cash')));
    await assertFails(setDoc(doc(as('u1'), 'users/u1/secrets/s1'), { any: 1 }));
  });

  it('rejects documents that break the schema (§8, BR-02, BR-03)', async () => {
    await seed({
      'users/u1': profile('active'),
      'users/u1/categories/exp_food': { name: 'Food', type: 'expense' },
    });
    const db = as('u1');
    await assertFails(setDoc(doc(db, 'users/u1/accounts/a'), { ...account(), name: '' }));
    await assertFails(setDoc(doc(db, 'users/u1/accounts/a'), { ...account(), type: 'crypto' }));
    await assertFails(
      setDoc(doc(db, 'users/u1/accounts/a'), { ...account(), currentBalance: 1.5 }),
    );
    await assertFails(setDoc(doc(db, 'users/u1/transactions/t'), { ...expense(), amount: 0 }));
    await assertFails(setDoc(doc(db, 'users/u1/transactions/t'), { ...expense(), amount: -5 }));
    await assertFails(
      setDoc(doc(db, 'users/u1/transactions/t'), { ...expense(), amount: 100000000000 }),
    );
    await assertFails(
      setDoc(doc(db, 'users/u1/transactions/t'), { ...expense(), date: '29/09/2026' }),
    );
    await assertFails(
      setDoc(doc(db, 'users/u1/transactions/t'), { ...expense(), categoryId: null }),
    );
    await assertFails(
      setDoc(doc(db, 'users/u1/transactions/t'), {
        ...expense(),
        type: 'transfer',
        categoryId: null,
        toAccountId: 'cash',
      }),
    );
    await assertSucceeds(
      setDoc(doc(db, 'users/u1/transactions/t'), {
        ...expense(),
        type: 'transfer',
        categoryId: null,
        toAccountId: 'bank',
        accountIds: ['cash', 'bank'],
      }),
    );
    await assertFails(setDoc(doc(db, 'users/u1/categories/c'), { name: '', type: 'expense' }));
    await assertFails(setDoc(doc(db, 'users/u1/categories/c'), { name: 'Fees', type: 'fee' }));
  });

  it('keeps the system categories (CAT-05)', async () => {
    await seed({
      'users/u1': profile('active'),
      'users/u1/categories/exp_uncategorized': {
        name: 'Uncategorized',
        type: 'expense',
        isSystem: true,
      },
      'users/u1/categories/exp_food': { name: 'Food', type: 'expense', isSystem: false },
    });
    await assertFails(deleteDoc(doc(as('u1'), 'users/u1/categories/exp_uncategorized')));
    await assertSucceeds(deleteDoc(doc(as('u1'), 'users/u1/categories/exp_food')));
  });
});

describe('admins (ADM-03 to ADM-07)', () => {
  beforeEach(() =>
    seed({
      'users/admin': profile('active', 'admin', 'admin@example.com'),
      'users/u1': profile('pending'),
      'users/u2': profile('active'),
      'users/u2/accounts/cash': account(),
    }),
  );

  it('can list profiles and change only role and status on other users', async () => {
    const db = as('admin');
    await assertSucceeds(getDocs(collection(db, 'users')));
    await assertSucceeds(updateDoc(doc(db, 'users/u1'), { status: 'active' }));
    await assertSucceeds(updateDoc(doc(db, 'users/u2'), { role: 'admin', status: 'disabled' }));
    await assertFails(updateDoc(doc(db, 'users/u2'), { status: 'active', theme: 'dark' }));
    await assertFails(updateDoc(doc(db, 'users/u2'), { status: 'banned' }));
    await assertFails(updateDoc(doc(db, 'users/u2'), { role: 'owner' }));
    await assertFails(deleteDoc(doc(db, 'users/u2')));
  });

  it('can never change their own role or status (ADM-05)', async () => {
    await assertFails(updateDoc(doc(as('admin'), 'users/admin'), { role: 'user' }));
    await assertFails(updateDoc(doc(as('admin'), 'users/admin'), { status: 'disabled' }));
    await assertSucceeds(updateDoc(doc(as('admin'), 'users/admin'), { theme: 'dark' }));
  });

  it('never sees another user’s financial data (ADM-07)', async () => {
    await assertFails(getDocs(collection(as('admin'), 'users/u2/accounts')));
    await assertFails(getDoc(doc(as('admin'), 'users/u2/accounts/cash')));
    await assertFails(setDoc(doc(as('admin'), 'users/u2/accounts/bank'), account()));
  });

  it('is only an admin while active', async () => {
    await seed({ 'users/former': profile('disabled', 'admin') });
    await assertFails(getDocs(collection(as('former'), 'users')));
    await assertFails(updateDoc(doc(as('former'), 'users/u1'), { status: 'active' }));
    await assertFails(getDocs(collection(as('u2'), 'users')));
    await assertFails(updateDoc(doc(as('u2'), 'users/u1'), { status: 'active' }));
  });

  it('manages invites, which a user may read for their own email only (ADM-08)', async () => {
    const admin = as('admin');
    await assertSucceeds(
      setDoc(doc(admin, 'invites/friend@example.com'), {
        email: 'friend@example.com',
        createdBy: 'admin',
      }),
    );
    await assertSucceeds(getDocs(collection(admin, 'invites')));
    await assertSucceeds(getDoc(doc(as('x', 'Friend@Example.com'), 'invites/friend@example.com')));
    await assertFails(getDoc(doc(as('x', 'other@example.com'), 'invites/friend@example.com')));
    await assertFails(getDocs(collection(as('u2'), 'invites')));
    await assertFails(setDoc(doc(as('u2'), 'invites/me@example.com'), { email: 'me@example.com' }));
    await assertSucceeds(deleteDoc(doc(admin, 'invites/friend@example.com')));
  });
});
