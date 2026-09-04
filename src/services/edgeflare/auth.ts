/**
 * Authentication against Dex (edgeflare's IdP), OAuth2 password grant.
 *
 * Exposes the same surface the app already consumes from the old Firebase auth
 * module, so screens and the sync store need only repoint their import:
 *   subscribeToAuth, signIn, signUp, signOutUser, friendlyAuthError, AuthUser.
 * Plus getAccessToken() for the REST/S3 layers.
 *
 * Tokens live in AsyncStorage. The access token is short-lived; the refresh
 * token (from `offline_access`) mints a new one when it expires. There is no
 * server push for auth state — signIn/signUp/signOut notify local listeners.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { clientId, iamUrl, isEdgeflareConfigured, scope } from '@/services/edgeflare/config';

export type AuthUser = { uid: string; email: string | null; displayName: string | null };

const ACCESS_KEY = 'edgeflare:access_token';
const REFRESH_KEY = 'edgeflare:refresh_token';

const tokenUrl = () => `${iamUrl}/token`;
// Dex Account API — same endpoint edgeforce-ng uses to provision users
// (src/app/core/services/iam.service.ts). Requires a bearer token: this tenant
// provisions accounts as an admin action, not anonymous self-registration.
const accountUsersUrl = () => `${iamUrl}/account/v1/users`;

// ── In-memory auth state + listeners ─────────────────────────────────
let currentUser: AuthUser | null = null;
let bootstrapped = false;
let bootstrapPromise: Promise<void> | null = null;
const listeners = new Set<(user: AuthUser | null) => void>();

function emit(): void {
  for (const l of listeners) l(currentUser);
}

/**
 * Subscribe to auth-state changes. Mirrors Firebase's onAuthStateChanged: the
 * callback fires once with the initial state (null when unconfigured or signed
 * out) and again on every sign-in/out. Returns an unsubscribe function.
 */
export function subscribeToAuth(callback: (user: AuthUser | null) => void): () => void {
  if (!isEdgeflareConfigured) {
    callback(null);
    return () => {};
  }
  listeners.add(callback);
  if (bootstrapped) {
    callback(currentUser);
  } else {
    void bootstrap().then(() => callback(currentUser));
  }
  return () => {
    listeners.delete(callback);
  };
}

/** Restore the session from storage on first use. */
async function bootstrap(): Promise<void> {
  if (bootstrapped) return;
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const token = await getAccessToken();
      currentUser = token ? userFromToken(token) : null;
      bootstrapped = true;
    })();
  }
  return bootstrapPromise;
}

// ── Sign in / up / out ───────────────────────────────────────────────
export async function signIn(email: string, password: string): Promise<AuthUser> {
  const body = form({
    grant_type: 'password',
    client_id: clientId,
    username: email.trim(),
    password,
    scope,
  });
  const res = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await readJson(res);
  if (!res.ok || !data?.access_token) {
    console.warn('[edgeflare] signIn failed', res.status, data);
    throw new AuthError(res.status, data);
  }
  return establishSession(data);
}

/**
 * Create an account via the Dex Account API, then sign in as the new user.
 *
 * IMPORTANT: on this tenant the account endpoint requires a bearer token
 * (accounts are admin-provisioned; there is no anonymous self-registration).
 * So an in-app sign-up by a brand-new, signed-out user will get 401/403 unless
 * the server is configured to allow public registration (e.g. a thin proxy
 * that injects a service token). We still send any token we hold, so this works
 * when an already-signed-in admin adds a user. See sql/README.md.
 */
export async function signUp(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
): Promise<AuthUser> {
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const token = await getAccessToken(); // present only if an admin is signed in
  const res = await fetch(accountUsersUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      email: email.trim(),
      username: email.trim(),
      password,
      full_name: fullName,
    }),
  });
  const data = await readJson(res);
  if (!res.ok) {
    console.warn('[edgeflare] signUp failed', res.status, data);
    // 401/403 here means "self-registration not allowed on this server", which
    // is a different failure than a bad login — flag it so the UI can say so.
    const code =
      res.status === 401 || res.status === 403
        ? 'signup_requires_admin'
        : res.status === 404
          ? 'signup_not_implemented'
          : data?.error;
    throw new AuthError(res.status, { ...data, error: code });
  }
  // Account created (or tokens returned directly); then sign in as the new user.
  if (data?.access_token) return establishSession(data);
  return signIn(email, password);
}

export async function signOutUser(): Promise<void> {
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
  currentUser = null;
  emit();
}

/** Persists a token response, updates in-memory state, notifies listeners. */
async function establishSession(data: TokenResponse): Promise<AuthUser> {
  await AsyncStorage.setItem(ACCESS_KEY, data.access_token);
  if (data.refresh_token) await AsyncStorage.setItem(REFRESH_KEY, data.refresh_token);
  // TEMP DEBUG: print the JWT claims so we can see whether a `uid` claim is
  // present (RLS keys off it). Remove once sync is confirmed working.
  console.log('[edgeflare] token claims:', decodeJwt(data.access_token));
  currentUser = userFromToken(data.access_token);
  bootstrapped = true;
  emit();
  if (!currentUser) throw new Error('Token missing uid claim');
  return currentUser;
}

// ── Token access + refresh ───────────────────────────────────────────
let refreshInFlight: Promise<string | null> | null = null;

/** A valid access token, refreshing when expired. null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  if (!isEdgeflareConfigured) return null;
  const token = await AsyncStorage.getItem(ACCESS_KEY);
  if (token && !isExpired(token)) return token;

  const refresh = await AsyncStorage.getItem(REFRESH_KEY);
  if (!refresh) return null;

  if (!refreshInFlight) {
    refreshInFlight = refreshWith(refresh).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function refreshWith(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(tokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken }),
    });
    const data = await readJson(res);
    if (!res.ok || !data?.access_token) {
      // Refresh token dead → force sign-out so the UI reflects it.
      await signOutUser();
      return null;
    }
    await AsyncStorage.setItem(ACCESS_KEY, data.access_token);
    if (data.refresh_token) await AsyncStorage.setItem(REFRESH_KEY, data.refresh_token);
    return data.access_token;
  } catch {
    return null;
  }
}

// ── JWT helpers ──────────────────────────────────────────────────────
type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
};

type JwtClaims = { uid?: string; sub?: string; email?: string; name?: string; exp?: number };

function userFromToken(token: string): AuthUser | null {
  const claims = decodeJwt(token);
  const uid = claims?.uid ?? claims?.sub;
  if (!uid) return null;
  return { uid, email: claims?.email ?? null, displayName: claims?.name ?? null };
}

function isExpired(token: string): boolean {
  const exp = decodeJwt(token)?.exp;
  if (!exp) return true;
  // 30s skew so we refresh just before the edge, not after a 401.
  return Date.now() >= exp * 1000 - 30_000;
}

function decodeJwt(token: string): JwtClaims | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(base64UrlDecode(payload)) as JwtClaims;
  } catch {
    return null;
  }
}

/** base64url → UTF-8 string, without relying on atob/Buffer being present. */
function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const g = globalThis as { atob?: (s: string) => string };
  if (typeof g.atob === 'function') return decodeURIComponent(escape(g.atob(b64)));
  // Minimal fallback decoder (Hermes exposes atob on recent RN, but be safe).
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const ch of b64) {
    if (ch === '=') break;
    const val = chars.indexOf(ch);
    if (val === -1) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  try {
    return decodeURIComponent(escape(out));
  } catch {
    return out;
  }
}

// ── HTTP helpers + friendly errors ───────────────────────────────────
function form(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function readJson(res: Response): Promise<any> {
  try {
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

class AuthError extends Error {
  constructor(
    readonly status: number,
    readonly data: any,
  ) {
    super(data?.error_description || data?.error || data?.message || `Auth error ${status}`);
    this.name = 'AuthError';
  }
}

/** Maps auth failures to friendly messages (no raw errors in the UI). */
export function friendlyAuthError(error: unknown): string {
  const e = error as { status?: number; data?: any; message?: string };
  const status = e?.status;
  const code = (e?.data?.error as string) ?? '';
  if (code === 'signup_not_implemented') {
    return 'Sign-up isn’t available on this server. Ask an admin to create your account.';
  }
  if (code === 'signup_requires_admin') {
    return 'Creating an account requires an administrator. Ask them to add you, then sign in.';
  }
  if (status === 409 || code === 'user_exists') return 'An account already exists for that email.';
  if (status === 401 || code === 'invalid_grant' || code === 'access_denied') {
    return 'Incorrect email or password.';
  }
  if (status === 400 && /password/i.test(e?.message ?? '')) return 'Password should be at least 6 characters.';
  if (status === 0 || /network|fetch/i.test(e?.message ?? '')) {
    return 'Network error. Check your connection and try again.';
  }
  if (status === 429) return 'Too many attempts. Please try again later.';
  return 'Something went wrong. Please try again.';
}
