/**
 * A single change bus for local data.
 *
 * Any repository mutation calls `emitChange()`; hooks subscribe via
 * `subscribeToChanges()` and re-query. Sharing one bus (rather than a per-repo
 * one) means note changes also refresh folder counts, trash counts, etc.
 *
 * Changes carry an origin so listeners can tell a user/local edit apart from a
 * write the sync engine made while applying remote data. UI listeners refresh on
 * either; the sync scheduler must ignore its own writes, otherwise every synced
 * row re-triggers a sync and the engine spins forever.
 */
export type ChangeOrigin = 'local' | 'sync';

type Listener = (origin: ChangeOrigin) => void;

const listeners = new Set<Listener>();

// Origin applied to emits made inside `withChangeOrigin`. Defaults to 'local'
// so ordinary user edits need no ceremony.
let activeOrigin: ChangeOrigin = 'local';

export function subscribeToChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitChange(): void {
  const origin = activeOrigin;
  listeners.forEach((listener) => listener(origin));
}

/**
 * Runs `fn` with every `emitChange()` it triggers tagged as `origin`. The sync
 * engine wraps its work in `withChangeOrigin('sync', …)` so the sync scheduler
 * can skip those emits and avoid a feedback loop, while UI listeners still
 * refresh to show the newly-synced data.
 */
export async function withChangeOrigin<T>(
  origin: ChangeOrigin,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = activeOrigin;
  activeOrigin = origin;
  try {
    return await fn();
  } finally {
    activeOrigin = previous;
  }
}
