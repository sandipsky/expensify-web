/*
 * Security Rules tests (docs/requirements.md §9, §14) on the Firestore
 * emulator: `npm run test:rules`. The owner is allowed; other users and
 * signed-out requests are denied; invalid documents are rejected.
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

const profile = () => ({
  displayName: 'Someone',
  email: 'someone@example.com',
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

const as = (uid: string) =>
  env.authenticatedContext(uid, { email: `${uid}@example.com` }).firestore();
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

describe('profiles (§8 users/{uid})', () => {
  it('lets a signed-in user create their own profile, and nobody else’s', async () => {
    await assertSucceeds(setDoc(doc(as('u1'), 'users/u1'), profile()));
    await assertFails(setDoc(doc(as('u2'), 'users/u3'), profile()));
    await assertFails(setDoc(doc(anonymous(), 'users/u4'), profile()));
  });

  it('lets a user read their own profile, and nobody else’s', async () => {
    await seed({ 'users/u1': profile(), 'users/u2': profile() });
    await assertSucceeds(getDoc(doc(as('u1'), 'users/u1')));
    await assertFails(getDoc(doc(as('u1'), 'users/u2')));
    await assertFails(getDoc(doc(anonymous(), 'users/u1')));
    await assertFails(getDocs(collection(as('u1'), 'users')));
  });

  it('lets a brand-new sign-up finish onboarding at once (US-10, ONB-01 to ONB-04)', async () => {
    const db = as('u1');
    await assertSucceeds(setDoc(doc(db, 'users/u1'), profile()));
    await assertSucceeds(getDocs(collection(db, 'users/u1/categories')));
    await assertSucceeds(
      setDoc(doc(db, 'users/u1/categories/exp_food'), {
        name: 'Food & Dining',
        type: 'expense',
        parentId: null,
        icon: 'restaurant',
        color: '#E53935',
        isSystem: false,
        archived: false,
        sortOrder: 0,
      }),
    );
    await assertSucceeds(setDoc(doc(db, 'users/u1/accounts/cash'), account()));
    await assertSucceeds(
      setDoc(doc(db, 'users/u1'), { onboardingCompleted: true }, { merge: true }),
    );
  });

  it('lets the owner change preferences and delete the profile', async () => {
    await seed({ 'users/u1': profile(), 'users/u2': profile() });
    await assertSucceeds(updateDoc(doc(as('u1'), 'users/u1'), { theme: 'dark' }));
    await assertSucceeds(
      setDoc(
        doc(as('u1'), 'users/u1'),
        { notificationPrefs: { budgetAlerts: false } },
        { merge: true },
      ),
    );
    await assertFails(updateDoc(doc(as('u1'), 'users/u2'), { theme: 'dark' }));
    await assertFails(deleteDoc(doc(as('u1'), 'users/u2')));
    await assertSucceeds(deleteDoc(doc(as('u1'), 'users/u1')));
  });
});

describe('financial data (§9)', () => {
  it('is readable and writable by the owner only, straight after sign-up', async () => {
    await seed({
      'users/u1/accounts/cash': account(),
      'users/u2/accounts/cash': account(),
    });
    await assertSucceeds(getDocs(collection(as('u1'), 'users/u1/accounts')));
    await assertSucceeds(setDoc(doc(as('u1'), 'users/u1/accounts/bank'), account()));
    await assertSucceeds(setDoc(doc(as('u1'), 'users/u1/transactions/t1'), expense()));
    await assertSucceeds(setDoc(doc(as('u1'), 'users/u1/budgets/b1'), { name: 'Food' }));

    await assertFails(getDocs(collection(as('u1'), 'users/u2/accounts')));
    await assertFails(getDoc(doc(as('u1'), 'users/u2/accounts/cash')));
    await assertFails(setDoc(doc(as('u1'), 'users/u2/accounts/bank'), account()));
    await assertFails(getDoc(doc(anonymous(), 'users/u1/accounts/cash')));
    await assertFails(setDoc(doc(as('u1'), 'users/u1/secrets/s1'), { any: 1 }));
  });

  it('rejects documents that break the schema (§8, BR-02, BR-03)', async () => {
    await seed({ 'users/u1/categories/exp_food': { name: 'Food', type: 'expense' } });
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

describe('everything outside users/{uid}', () => {
  it('is closed', async () => {
    await assertFails(getDoc(doc(as('u1'), 'invites/u1@example.com')));
    await assertFails(setDoc(doc(as('u1'), 'anything/x'), { any: 1 }));
  });
});
