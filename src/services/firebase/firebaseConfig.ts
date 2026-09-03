/**
 * Firebase initialization (§47).
 *
 * Config comes from EXPO_PUBLIC_* env vars (§46) — these are client config
 * values, not secrets; security is enforced by Firestore/Storage rules.
 *
 * The app is offline-first and must run with NO Firebase project configured.
 * When the env vars are absent, `isFirebaseConfigured` is false and the auth /
 * sync layers stay dormant; the local app works exactly as before.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  // getReactNativePersistence keeps the user signed in across launches.
  // @ts-expect-error — exported at runtime by firebase/auth for React Native.
  getReactNativePersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const isFirebaseConfigured = Boolean(
  config.apiKey && config.projectId && config.appId,
);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

if (isFirebaseConfigured) {
  app = getApps().length
    ? getApps()[0]
    : initializeApp(config as Record<string, string>);
  try {
    authInstance = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // initializeAuth throws if already initialized (fast refresh) — reuse it.
    authInstance = getAuth(app);
  }
  dbInstance = getFirestore(app);
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) throw new Error("Firebase is not configured");
  return authInstance;
}

export function getDb(): Firestore {
  if (!dbInstance) throw new Error("Firebase is not configured");
  return dbInstance;
}
