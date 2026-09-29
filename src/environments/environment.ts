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
    /** Registers a debug token instead of solving reCAPTCHA; only for local development. */
    debug: false,
  },
  /** Talk to the local Emulator Suite (`firebase emulators:start`) instead of the cloud project. */
  useEmulators: false,
};
