/**
 * Network monitor (§10).
 *
 * Wraps NetInfo in a tiny observable so the rest of the app depends on our own
 * interface, not the library. When connectivity returns, the (future) sync
 * engine will subscribe here to start a push. Sprint 2 uses it only for the
 * offline indicator.
 */
import NetInfo from '@react-native-community/netinfo';

export type NetworkState = {
  isConnected: boolean;
  isInternetReachable: boolean;
};

let current: NetworkState = { isConnected: true, isInternetReachable: true };
const listeners = new Set<(state: NetworkState) => void>();
let unsubscribeNetInfo: (() => void) | null = null;

function start(): void {
  if (unsubscribeNetInfo) return;
  unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    const next: NetworkState = {
      isConnected: state.isConnected ?? false,
      // `null` means "unknown" — treat as reachable so we don't false-alarm offline.
      isInternetReachable: state.isInternetReachable ?? state.isConnected ?? false,
    };
    if (next.isConnected !== current.isConnected || next.isInternetReachable !== current.isInternetReachable) {
      current = next;
      listeners.forEach((listener) => listener(current));
    }
  });
}

export function getNetworkState(): NetworkState {
  return current;
}

/** Subscribe to connectivity changes. Returns an unsubscribe function. */
export function subscribeToNetwork(listener: (state: NetworkState) => void): () => void {
  start();
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsubscribeNetInfo) {
      unsubscribeNetInfo();
      unsubscribeNetInfo = null;
    }
  };
}
