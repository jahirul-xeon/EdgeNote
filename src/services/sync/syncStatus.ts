/**
 * Observable sync status for the UI (§11). Values map to user-facing copy:
 * idle → "Saved/Synced", syncing → "Syncing…", offline → "Offline",
 * error → "Couldn't sync".
 */
export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error';

export type SyncState = {
  phase: SyncPhase;
  lastSyncAt: number | null;
  pendingCount: number;
};

let state: SyncState = { phase: 'idle', lastSyncAt: null, pendingCount: 0 };
const listeners = new Set<(state: SyncState) => void>();

export function getSyncState(): SyncState {
  return state;
}

export function subscribeToSyncState(listener: (state: SyncState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setSyncState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener(state));
}
