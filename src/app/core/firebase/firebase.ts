import { FirebaseApp, initializeApp } from 'firebase/app';
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check';
import { Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';

/**
 * The Firebase services the app talks to (§10 "Firebase setup"): the app,
 * App Check and Auth from the start, and Firestore with its persistent
 * multi-tab cache once someone is signed in. Only `FirestoreDb` and
 * `AuthService` reach in here; components, stores and repos never import
 * `firebase/*` themselves.
 */
export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
}

/** The Firestore SDK's functions, loaded with the database (see `loadFirestore`). */
export type FirestoreModule = typeof import('firebase/firestore');

export interface FirestoreServices {
  db: Firestore;
  fs: FirestoreModule;
}

/** Whether `environment.ts` holds a project's settings yet (docs/firebase.md). */
export function isFirebaseConfigured(): boolean {
  const { apiKey, projectId } = environment.firebase;
  return Boolean(apiKey && projectId);
}

/** Where to read the setup steps when the settings are missing. */
export const FIREBASE_SETUP_GUIDE = 'docs/firebase.md';

let services: FirebaseServices | undefined;
let firestoreServices: Promise<FirestoreServices> | undefined;

/**
 * Initializes the app, App Check and Auth on first use and hands back the
 * same instances after. Throws when the settings are missing, so sign-in can
 * explain instead of failing on a network call.
 */
export function firebase(): FirebaseServices {
  if (services) return services;
  if (!isFirebaseConfigured()) {
    throw new Error(
      `Firebase isn't configured: fill in src/environments (${FIREBASE_SETUP_GUIDE}).`,
    );
  }
  const app = initializeApp(environment.firebase);

  // App Check (§10): reCAPTCHA Enterprise in the cloud, a debug token on a
  // developer's machine. The flag must be set before App Check initializes.
  if (environment.appCheck.debug) {
    (self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  if (environment.appCheck.recaptchaSiteKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(environment.appCheck.recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  // Sessions persist in IndexedDB until the user signs out (AUTH-05).
  const auth = getAuth(app);
  if (environment.useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }

  services = { app, auth };
  return services;
}

/**
 * Loads the Firestore SDK and opens the database, once. It's the largest
 * part of the SDK and the sign-in pages don't need it, so it stays out of
 * the initial bundle (NFR-02) and arrives with the first read after sign-in.
 */
export function loadFirestore(): Promise<FirestoreServices> {
  firestoreServices ??= import('firebase/firestore').then((fs) => {
    const db = fs.initializeFirestore(firebase().app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
    if (environment.useEmulators) fs.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    return { db, fs };
  });
  return firestoreServices;
}
