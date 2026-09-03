/**
 * Lightweight unique id generator.
 *
 * Avoids a crypto dependency for Sprint 1. Ids are sortable-ish (timestamp
 * prefix) and collision-resistant enough for a single-user local store.
 */
export function createId(prefix = 'note'): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${time}${rand}`;
}
