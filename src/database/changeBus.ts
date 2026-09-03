/**
 * A single change bus for local data.
 *
 * Any repository mutation calls `emitChange()`; hooks subscribe via
 * `subscribeToChanges()` and re-query. Sharing one bus (rather than a per-repo
 * one) means note changes also refresh folder counts, trash counts, etc.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeToChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitChange(): void {
  listeners.forEach((listener) => listener());
}
