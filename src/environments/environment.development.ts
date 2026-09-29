/*
 * Firebase settings for `npm start` (the dev project, or the emulators). The
 * values come from the Firebase console; docs/firebase.md walks through
 * getting them and filling this file in. Safe to commit, as environment.ts
 * explains.
 */
export const environment = {
  production: false,
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
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
