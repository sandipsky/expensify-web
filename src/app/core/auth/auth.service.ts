import { Injectable, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  deleteUser,
  linkWithCredential,
  linkWithPopup,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  unlink,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import { UsersRepo } from '../data/users.repo';
import { guessCurrency } from '../domain/currency-guess';
import { firebase, isFirebaseConfigured } from '../firebase/firebase';
import { DEFAULT_NOTIFICATION_PREFS } from '../models/user';
import { DEFAULT_CURRENCY, deviceLocale, deviceTimeZone } from '../preferences';
import { AuthError, toAuthError } from './auth-errors';

/** Firebase's provider IDs for the two sign-in methods the app offers (AUTH-01, AUTH-03). */
export const PASSWORD_PROVIDER = 'password';
export const GOOGLE_PROVIDER = 'google.com';

/** The signed-in user as screens see them; nothing from `firebase/*` leaks past this. */
export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  /** Which sign-in methods are linked: `password`, `google.com`. */
  providers: readonly string[];
}

/** The page signed-out users go to, and where sign-out lands. */
export const LOGIN_URL = '/login';

/**
 * Firebase Auth behind signals (§3.1), plus the sign-in flow of §10: once Auth
 * resolves, the user's own profile is listened to; if the server says there
 * is none, one is created, and the user goes on to onboarding. Signing out
 * reloads the page, which drops every store's data before another user can
 * sign in.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly users = inject(UsersRepo);
  private readonly injector = inject(Injector);

  /** False until `environment.ts` holds a Firebase project (docs/firebase.md). */
  readonly configured = isFirebaseConfigured();

  private readonly _user = signal<AuthUser | null | undefined>(this.configured ? undefined : null);
  /** `undefined` until the session is restored, `null` while signed out (AUTH-05). */
  readonly user = this._user.asReadonly();

  private readonly snapshot = toSignal(this.users.watchProfile());
  /** The signed-in user's profile; `null` until it exists. */
  readonly profile = computed(() => {
    const user = this.user();
    const snapshot = this.snapshot();
    return user && snapshot?.uid === user.uid ? snapshot.profile : null;
  });

  /**
   * True once the guards can decide: the session is known, and a signed-in
   * user's profile has been read from the server or created.
   */
  readonly settled = computed(() => {
    const user = this.user();
    if (user === undefined) return false;
    return user === null || this.profile() !== null;
  });

  /** The uid a profile is being created for, so the effect doesn't create it twice. */
  private creatingFor: string | null = null;
  /** The name typed at registration, until Auth carries it. */
  private nameForNewProfile: string | null = null;
  /** `undefined` until the session is known, to tell "signed out" from "just signed out". */
  private lastUid: string | null | undefined;

  constructor() {
    if (this.configured) {
      onAuthStateChanged(firebase().auth, (user) => this._user.set(user ? toAuthUser(user) : null));
    }
    effect(() => this.ensureProfile());
    effect(() => this.follow());
  }

  /** Resolves once {@link settled} is true; the guards wait on it. */
  ready(): Promise<void> {
    if (this.settled()) return Promise.resolve();
    return new Promise((resolve) => {
      const ref = effect(
        () => {
          if (!this.settled()) return;
          resolve();
          ref.destroy();
        },
        { injector: this.injector },
      );
    });
  }

  /** Email and password sign-in (AUTH-01). Throws an {@link AuthError}. */
  async signIn(email: string, password: string): Promise<void> {
    await this.run(() => signInWithEmailAndPassword(firebase().auth, email.trim(), password));
  }

  /** Google sign-in in a popup (AUTH-03). Throws an {@link AuthError}. */
  async signInWithGoogle(): Promise<void> {
    await this.run(() => signInWithPopup(firebase().auth, new GoogleAuthProvider()));
  }

  /**
   * Creates the login (AUTH-01). No verification email is sent (AUTH-02): the
   * account can be used at once. The name goes on the Auth user and the new
   * profile.
   */
  async register(name: string, email: string, password: string): Promise<void> {
    const displayName = name.trim() || null;
    this.nameForNewProfile = displayName;
    const credential = await this.run(() =>
      createUserWithEmailAndPassword(firebase().auth, email.trim(), password),
    );
    if (displayName) {
      await updateProfile(credential.user, { displayName }).catch(() => undefined);
      this.refresh();
    }
  }

  /** Emails a password reset link (AUTH-04). Throws an {@link AuthError}. */
  async sendPasswordReset(email: string): Promise<void> {
    await this.run(() => sendPasswordResetEmail(firebase().auth, email.trim()));
  }

  /** Ends the session and reloads on the sign-in page, so no store keeps this user's data. */
  async signOut(): Promise<void> {
    await signOut(firebase().auth).catch(() => undefined);
    this.leave(LOGIN_URL);
  }

  /** Saves a new display name on the login and the profile (AUTH-08). */
  async updateName(name: string): Promise<void> {
    const displayName = name.trim();
    await this.run(() => updateProfile(this.current(), { displayName }));
    this.users.updateIdentity({ displayName });
    this.refresh();
  }

  /** Saves a new profile photo, or removes it with `null` (AUTH-08). Profile only: the photo is a data URL. */
  updatePhoto(photoURL: string | null): void {
    this.users.updateIdentity({ photoURL });
  }

  /** Proves it's really the user, with their password (AUTH-07, AUTH-09). */
  async reauthenticateWithPassword(password: string): Promise<void> {
    const user = this.current();
    const credential = EmailAuthProvider.credential(user.email ?? '', password);
    await this.run(() => reauthenticateWithCredential(user, credential));
  }

  /** Proves it's really the user, through Google (AUTH-07). */
  async reauthenticateWithGoogle(): Promise<void> {
    await this.run(() => reauthenticateWithPopup(this.current(), new GoogleAuthProvider()));
  }

  /** Changes the password after checking the current one (AUTH-09). */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.reauthenticateWithPassword(currentPassword);
    await this.run(() => updatePassword(this.current(), newPassword));
  }

  /** Adds email and password sign-in to a Google login (AUTH-10). */
  async setPassword(password: string): Promise<void> {
    const user = this.current();
    const credential = EmailAuthProvider.credential(user.email ?? '', password);
    await this.run(() => linkWithCredential(user, credential));
    this.refresh();
  }

  /** Adds Google sign-in to an email login (AUTH-10). */
  async linkGoogle(): Promise<void> {
    await this.run(() => linkWithPopup(this.current(), new GoogleAuthProvider()));
    this.refresh();
  }

  /** Removes Google sign-in; only offered while a password is set, so the user can still get in. */
  async unlinkGoogle(): Promise<void> {
    await this.run(() => unlink(this.current(), GOOGLE_PROVIDER));
    this.refresh();
  }

  /** Deletes the login itself, the last step of deleting the account (AUTH-07); re-authenticate first. */
  async deleteLogin(): Promise<void> {
    await this.run(() => deleteUser(this.current()));
  }

  /** Leaves the app for `url` with a full reload, dropping every in-memory store. */
  leave(url: string): void {
    window.location.assign(url);
  }

  /**
   * Creates the profile once the server has said there is none (§10
   * "Sign-in flow"). A cache-only answer isn't enough: another device may have
   * created it, and overwriting would reset the user's preferences and
   * onboarding.
   */
  private ensureProfile(): void {
    const user = this.user();
    const snapshot = this.snapshot();
    if (!user || !snapshot || snapshot.uid !== user.uid) return;
    if (snapshot.profile || snapshot.fromCache || this.creatingFor === user.uid) return;
    this.creatingFor = user.uid;
    untracked(() => this.createProfile(user));
  }

  private createProfile(user: AuthUser): void {
    const locale = deviceLocale();
    this.users.create({
      displayName: user.displayName ?? this.nameForNewProfile,
      email: user.email,
      photoURL: user.photoURL,
      baseCurrency: guessCurrency(locale, DEFAULT_CURRENCY),
      locale,
      timeZone: deviceTimeZone(),
      monthStartDay: 1,
      weekStartDay: 1,
      theme: 'system',
      onboardingCompleted: false,
      notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
    });
  }

  /**
   * Keeps the screen in step with the session while the app is open: a
   * session that ends elsewhere reloads onto sign-in. The guards do the same
   * on navigation.
   */
  private follow(): void {
    const user = this.user();
    if (user === undefined) return;
    const previous = this.lastUid;
    this.lastUid = user?.uid ?? null;
    if (!user && previous) this.leave(LOGIN_URL);
  }

  private current(): User {
    const user = firebase().auth.currentUser;
    if (!user) throw new AuthError('auth/no-current-user', 'You’re signed out. Sign in again.');
    return user;
  }

  /** Re-reads the Auth user after a change the listener doesn't report, such as a new name. */
  private refresh(): void {
    const user = firebase().auth.currentUser;
    this._user.set(user ? toAuthUser(user) : null);
  }

  private async run<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      throw toAuthError(error);
    }
  }
}

function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    providers: user.providerData.map((p) => p.providerId),
  };
}
