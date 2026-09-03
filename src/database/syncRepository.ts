/**
 * Sync queue repository.
 *
 * Every local mutation is recorded here so that when the sync engine arrives
 * (Sprint 3) it has a durable, ordered list of changes to push — even across
 * app restarts while offline. There is no consumer yet; this is the offline
 * foundation the plan's Sprint 2 calls for (§31, §32).
 *
 * Updates are coalesced: repeated edits to the same entity keep a single
 * pending row instead of growing the queue on every debounced autosave.
 */
import { getDatabase } from '@/database/database';

export type EntityType = 'note' | 'folder';
export type SyncOperation = 'create' | 'update' | 'delete';

type QueueRow = {
  id: number;
  entity_type: string;
  entity_id: string;
  operation: string;
  payload_json: string;
  created_at: number;
  retry_count: number;
  last_error: string | null;
  next_attempt_at: number;
};

export type SyncQueueItem = {
  id: number;
  entityType: EntityType;
  entityId: string;
  operation: SyncOperation;
  payload: unknown;
  createdAt: number;
  retryCount: number;
  lastError: string | null;
};

/**
 * Records a change for later sync.
 *
 * - `create` then later `update`: the create row is kept and its payload
 *   refreshed, so the entity syncs once as a create.
 * - repeated `update`s: coalesced into the single existing pending row.
 * - `delete` of an entity that only ever existed locally (a pending create
 *   that never synced): both rows are dropped — a net no-op.
 */
export async function enqueue(
  entityType: EntityType,
  entityId: string,
  operation: SyncOperation,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  const payloadJson = JSON.stringify(payload);

  const existing = await db.getFirstAsync<QueueRow>(
    `SELECT * FROM sync_queue
     WHERE entity_type = ? AND entity_id = ?
     ORDER BY id ASC LIMIT 1`,
    [entityType, entityId],
  );

  if (operation === 'delete' && existing && existing.operation === 'create') {
    // Created and deleted before ever syncing: erase the whole intent.
    await db.runAsync('DELETE FROM sync_queue WHERE entity_type = ? AND entity_id = ?', [
      entityType,
      entityId,
    ]);
    return;
  }

  if (operation === 'update' && existing && existing.operation !== 'delete') {
    // Fold this edit into the existing pending create/update row.
    await db.runAsync(
      "UPDATE sync_queue SET payload_json = ?, created_at = ?, last_error = NULL WHERE id = ?",
      [payloadJson, now, existing.id],
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO sync_queue (entity_type, entity_id, operation, payload_json, created_at, retry_count)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [entityType, entityId, operation, payloadJson, now],
  );
}

function mapItem(row: QueueRow): SyncQueueItem {
  return {
    id: row.id,
    entityType: row.entity_type as EntityType,
    entityId: row.entity_id,
    operation: row.operation as SyncOperation,
    payload: safeParse(row.payload_json),
    createdAt: row.created_at,
    retryCount: row.retry_count,
    lastError: row.last_error,
  };
}

/** Pending queue items in insertion order. For the sync engine and debugging. */
export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<QueueRow>('SELECT * FROM sync_queue ORDER BY id ASC');
  return rows.map(mapItem);
}

/** Queue items whose backoff has elapsed and are ready to attempt now. */
export async function getDueSyncItems(now: number = Date.now()): Promise<SyncQueueItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<QueueRow>(
    'SELECT * FROM sync_queue WHERE next_attempt_at <= ? ORDER BY id ASC',
    now,
  );
  return rows.map(mapItem);
}

export async function removeSyncItem(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM sync_queue WHERE id = ?', id);
}

/** Backoff schedule in ms by attempt number (§33): 2s, 5s, 15s, 30s, 60s, cap. */
const BACKOFF_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

export async function recordSyncFailure(
  id: number,
  retryCount: number,
  message: string,
): Promise<void> {
  const db = await getDatabase();
  const delay = BACKOFF_MS[Math.min(retryCount, BACKOFF_MS.length - 1)];
  await db.runAsync(
    'UPDATE sync_queue SET retry_count = retry_count + 1, last_error = ?, next_attempt_at = ? WHERE id = ?',
    [message.slice(0, 500), Date.now() + delay, id],
  );
}

export async function getPendingSyncCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sync_queue');
  return row?.count ?? 0;
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}
