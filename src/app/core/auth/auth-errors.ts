/**
 * A sign-in, registration or account operation that Firebase Auth refused,
 * with a message written for the screen. `code` is Firebase's (`auth/...`).
 */
export class AuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/** Sentences for the Firebase Auth error codes users can run into (NFR-17: English until i18n). */
const MESSAGES: Readonly<Record<string, string>> = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'Wrong email or password.',
  'auth/invalid-email': 'That email address doesn’t look right.',
  'auth/missing-password': 'Enter your password.',
  'auth/email-already-in-use': 'There’s already an account with this email. Sign in instead.',
  'auth/weak-password': 'Use at least 8 characters.',
  'auth/password-does-not-meet-requirements': 'That password doesn’t meet the requirements.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes, then try again.',
  'auth/network-request-failed': 'Can’t reach the server. Check your connection and try again.',
  'auth/user-disabled': 'This login has been switched off. Contact the admin.',
  'auth/popup-closed-by-user': 'The Google window was closed before you signed in.',
  'auth/cancelled-popup-request': 'The Google window was closed before you signed in.',
  'auth/popup-blocked':
    'Your browser blocked the Google sign-in window. Allow pop-ups for this site.',
  'auth/unauthorized-domain':
    'This website isn’t on the Firebase project’s list of authorized domains yet.',
  'auth/operation-not-allowed': 'This sign-in method isn’t turned on in the Firebase project yet.',
  'auth/requires-recent-login': 'For safety, sign in again before doing this.',
  'auth/account-exists-with-different-credential':
    'This email already signs in another way. Use that, then link Google from Settings.',
  'auth/credential-already-in-use': 'That Google account is already linked to another login.',
  'auth/email-already-exists': 'That email already belongs to another login.',
  'auth/provider-already-linked': 'That sign-in method is already linked.',
  'auth/no-such-provider': 'That sign-in method isn’t linked to this account.',
  'auth/user-mismatch': 'That’s a different account. Sign in again with this one.',
  'auth/invalid-action-code': 'This link has expired or was already used. Ask for a new one.',
  'auth/expired-action-code': 'This link has expired. Ask for a new one.',
};

export const DEFAULT_AUTH_MESSAGE = 'Something went wrong. Please try again.';

/** The sentence for a Firebase Auth error code, or a general one. */
export function authErrorMessage(code: string | undefined): string {
  return (code && MESSAGES[code]) || DEFAULT_AUTH_MESSAGE;
}

/** Wraps whatever Firebase threw as an {@link AuthError}. */
export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error;
  const code =
    error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : 'auth/unknown';
  return new AuthError(code, authErrorMessage(code));
}
