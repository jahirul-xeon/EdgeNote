/**
 * Authentication service (§29). Wraps Firebase Auth so screens depend on our
 * interface, never on the SDK directly.
 */
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';

import { getFirebaseAuth, isFirebaseConfigured } from '@/services/firebase/firebaseConfig';
import { setUserProfile } from '@/services/firebase/firestore';

export type AuthUser = { uid: string; email: string | null; displayName: string | null };

export function subscribeToAuth(callback: (user: AuthUser | null) => void): () => void {
  if (!isFirebaseConfigured) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(getFirebaseAuth(), (user) => {
    callback(
      user ? { uid: user.uid, email: user.email, displayName: user.displayName } : null,
    );
  });
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  return { uid: cred.user.uid, email: cred.user.email, displayName: cred.user.displayName };
}

export async function signUp(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
): Promise<AuthUser> {
  const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();

  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  try {
    await setUserProfile(cred.user.uid, {
      email: cred.user.email,
      displayName,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    });
  } catch {
    // Non-fatal: the account exists; the profile doc can be written on a later sync.
  }

  return { uid: cred.user.uid, email: cred.user.email, displayName: displayName || null };
}

export async function signOutUser(): Promise<void> {
  await signOut(getFirebaseAuth());
}

/** Maps Firebase auth error codes to friendly messages (§11 — no raw errors). */
export function friendlyAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/email-already-in-use':
      return 'An account already exists for that email.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
