/*
 * Firebase settings for `npm start` (the dev project, or the emulators). The
 * values come from the Firebase console; docs/firebase.md walks through
 * getting them and filling this file in. Safe to commit, as environment.ts
 * explains.
 */
export const environment = {
  production: false,
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
    /** Registers a debug token instead of solving reCAPTCHA (App Check's debug provider). */
    debug: true,
  },
  /** Talk to the local Emulator Suite (`firebase emulators:start`) instead of the cloud project. */
  useEmulators: false,
};
