/*
 * Firebase settings for the production build (`npm run build`). The values
 * come from the Firebase console; docs/firebase.md walks through getting them
 * and filling this file in. They are safe to commit: a web app's Firebase
 * config is public by design, and access is controlled by the Security Rules
 * (firestore.rules) and App Check, not by keeping these secret.
 *
 * `ng serve` uses environment.development.ts instead.
 */
export const environment = {
  production: true,
  firebase: {
    apiKey: "AIzaSyCqTDdb8Fgq4ojpV3-z2FzfHQ_EApFsLT4",
    authDomain: "expense-tracker-5b5b9.firebaseapp.com",
    projectId: "expense-tracker-5b5b9",
    storageBucket: "expense-tracker-5b5b9.firebasestorage.app",
    messagingSenderId: "462108626354",
    appId: "1:462108626354:web:9a8b728ca58d4cd031e8ab",
    measurementId: "G-CV60D5P3S8"
  },
  appCheck: {
    /** reCAPTCHA Enterprise site key from the App Check page; leave empty to run without App Check. */
    recaptchaSiteKey: '',
    /** Registers a debug token instead of solving reCAPTCHA; only for local development. */
    debug: false,
  },
  /** Talk to the local Emulator Suite (`firebase emulators:start`) instead of the cloud project. */
  useEmulators: false,
};
