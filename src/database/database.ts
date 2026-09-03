/**
 * SQLite database access.
 *
 * A single cached connection is shared across the app. Repositories and the
 * (future) sync engine import `getDatabase()` directly rather than going
 * through React context, so data access works outside the component tree.
 *
 * Schema versions are tracked with `PRAGMA user_version`; see `migrate()`.
 */
import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'notes.db';

/** Current schema version. Bump and add a migration block below when changing schema. */
const SCHEMA_VERSION = 2;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Returns the shared database connection, opening and migrating it once. */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate().catch((error) => {
      // Reset so a later call can retry a failed open instead of caching the rejection.
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await migrate(db);
  return db;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion >= SCHEMA_VERSION) {
    return;
  }

  if (currentVersion < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        content_format TEXT NOT NULL DEFAULT 'plain',
        folder_id TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]',
        is_pinned INTEGER NOT NULL DEFAULT 0,
        is_locked INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        sync_status TEXT NOT NULL DEFAULT 'synced',
        sync_version INTEGER NOT NULL DEFAULT 0,
        device_id TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes (updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes (folder_id);
      CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes (is_deleted);
      CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes (is_pinned);

      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        icon TEXT,
        color TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'synced'
      );

      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );
    `);
  }

  if (currentVersion < 2) {
    // Backoff scheduling for the sync engine: a queue item is skipped until now
    // passes its next_attempt_at.
    await db.execAsync(
      'ALTER TABLE sync_queue ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0;',
    );
  }

  // Future migrations: `if (currentVersion < 3) { ... }`, etc.

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

/** Drops all data. Used by "Clear local cache" and tests. */
export async function resetDatabase(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    DELETE FROM notes;
    DELETE FROM folders;
    DELETE FROM sync_queue;
  `);
}
