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
const SCHEMA_VERSION = 5;

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
  // The full target schema is declared once with idempotent DDL and applied on
  // every open. This is deliberately NOT gated on `user_version`: earlier
  // versions bumped the version from migration blocks that were later edited in
  // place, leaving some databases stamped at a version whose tables/columns were
  // never actually created (e.g. a missing `attachments` table or `blocks_json`
  // column). Re-declaring the whole schema idempotently converges any such
  // drifted database onto the current shape without data loss.
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

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'file',
      local_uri TEXT,
      remote_url TEXT,
      storage_path TEXT,
      name TEXT,
      mime_type TEXT,
      size INTEGER,
      width INTEGER,
      height INTEGER,
      upload_status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_attachments_note ON attachments (note_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_upload ON attachments (upload_status);
  `);

  // Columns added to existing tables after v1. ALTER TABLE ... ADD COLUMN has no
  // IF NOT EXISTS form, so each is guarded by an existence check.
  await ensureColumn(db, 'sync_queue', 'next_attempt_at', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'notes', 'blocks_json', 'TEXT');

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

/** True if `table` already has a column named `column`. */
async function columnExists(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
): Promise<boolean> {
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}

/** Adds a column via ALTER TABLE only if it is not already present (idempotent). */
async function ensureColumn(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  if (!(await columnExists(db, table, column))) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

/** Drops all data. Used by "Clear local cache" and tests. */
export async function resetDatabase(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    DELETE FROM notes;
    DELETE FROM folders;
    DELETE FROM sync_queue;
    DELETE FROM attachments;
  `);
}
