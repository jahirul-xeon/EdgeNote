/**
 * Auth + sync orchestration. Holds the signed-in user and drives the sync
 * engine on the events that matter (§34): sign-in, network regained, app
 * foregrounded, and (debounced) local edits.
 *
 * When edgeflare is not configured, this stays inert and the app runs purely
 * local — the golden rule holds either way (§75).
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { subscribeToChanges } from '@/database/changeBus';
import { subscribeToAuth, signOutUser, type AuthUser } from '@/services/edgeflare/auth';
import { isEdgeflareConfigured } from '@/services/edgeflare/config';
import { subscribeToNetwork } from '@/services/network/networkMonitor';
import { claimLocalData, requestSync } from '@/services/sync/syncEngine';
import { setSyncState } from '@/services/sync/syncStatus';

type AuthContextValue = {
  user: AuthUser | null;
  isConfigured: boolean;
  initializing: boolean;
  signOut: () => Promise<void>;
  syncNow: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const CHANGE_SYNC_DEBOUNCE = 1500;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(isEdgeflareConfigured);
  const previousUid = useRef<string | null>(null);

  // Track auth state, claiming local data + syncing on a fresh sign-in.
  useEffect(() => {
    if (!isEdgeflareConfigured) {
      setInitializing(false);
      return;
    }
    return subscribeToAuth((next) => {
      setUser(next);
      setInitializing(false);
      if (next && next.uid !== previousUid.current) {
        previousUid.current = next.uid;
        claimLocalData(next.uid)
          .then(() => requestSync(next.uid))
          .catch(() => {});
      } else if (!next) {
        previousUid.current = null;
      }
    });
  }, []);

  // While signed in, sync on connectivity, foreground, and debounced edits.
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    let wasConnected = true;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const netUnsub = subscribeToNetwork((state) => {
      const online = state.isConnected && state.isInternetReachable;
      if (online && !wasConnected) requestSync(uid);
      wasConnected = online;
      if (!online) setSyncState({ phase: 'offline' });
    });

    const appStateSub = AppState.addEventListener('change', (status) => {
      if (status === 'active') requestSync(uid);
    });

    const changeUnsub = subscribeToChanges((origin) => {
      // Ignore writes the sync engine itself made while applying remote data —
      // reacting to them would loop (sync → write → sync → …). Only real local
      // edits schedule a push.
      if (origin === 'sync') return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => requestSync(uid), CHANGE_SYNC_DEBOUNCE);
    });

    return () => {
      netUnsub();
      appStateSub.remove();
      changeUnsub();
      if (debounce) clearTimeout(debounce);
    };
  }, [user]);

  const value: AuthContextValue = {
    user,
    isConfigured: isEdgeflareConfigured,
    initializing,
    signOut: async () => {
      await signOutUser();
      setSyncState({ phase: 'idle', lastSyncAt: null, pendingCount: 0 });
    },
    syncNow: () => {
      if (user) requestSync(user.uid);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
