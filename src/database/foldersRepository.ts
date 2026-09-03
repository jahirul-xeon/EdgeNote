/**
 * Folders repository. The single place folders are read/written.
 *
 * Deleting a folder does not delete its notes; they are moved to All Notes
 * (folder_id = NULL) so the user never loses work.
 */
import { emitChange } from '@/database/changeBus';
import { getDatabase } from '@/database/database';
import { getNoteCountsByFolder } from '@/database/notesRepository';
import { enqueue } from '@/database/syncRepository';
import type { Folder, FolderWithCount } from '@/types/folder';
import { createId } from '@/utils/id';

const LOCAL_USER_ID = 'local-user';

type FolderRow = {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  created_at: number;
  updated_at: number;
  sync_status: string;
};

function mapRow(row: FolderRow): Folder {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncStatus: row.sync_status,
  };
}

/** All folders, alphabetical, each with its active-note count. */
export async function getFolders(): Promise<FolderWithCount[]> {
  const db = await getDatabase();
  const [rows, counts] = await Promise.all([
    db.getAllAsync<FolderRow>('SELECT * FROM folders ORDER BY name COLLATE NOCASE ASC'),
    getNoteCountsByFolder(),
  ]);
  return rows.map((row) => ({ ...mapRow(row), noteCount: counts[row.id] ?? 0 }));
}

export async function getFolder(id: string): Promise<Folder | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<FolderRow>('SELECT * FROM folders WHERE id = ?', id);
  return row ? mapRow(row) : null;
}

export async function createFolder(name: string): Promise<Folder> {
  const db = await getDatabase();
  const now = Date.now();
  const folder: Folder = {
    id: createId('folder'),
    userId: LOCAL_USER_ID,
    name: name.trim(),
    icon: null,
    color: null,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  };
  await db.runAsync(
    `INSERT INTO folders (id, user_id, name, icon, color, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [folder.id, folder.userId, folder.name, null, null, now, now],
  );
  await enqueue('folder', folder.id, 'create', { name: folder.name });
  emitChange();
  return folder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const db = await getDatabase();
  const trimmed = name.trim();
  if (trimmed.length === 0) return;
  await db.runAsync(
    "UPDATE folders SET name = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?",
    [trimmed, Date.now(), id],
  );
  await enqueue('folder', id, 'update', { name: trimmed });
  emitChange();
}

/** Deletes a folder and reassigns its notes to All Notes (folder_id = NULL). */
export async function deleteFolder(id: string): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  const affected = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM notes WHERE folder_id = ?',
    id,
  );
  await db.runAsync(
    `UPDATE notes SET folder_id = NULL, updated_at = ?,
       sync_status = 'pending', sync_version = sync_version + 1
     WHERE folder_id = ?`,
    [now, id],
  );
  await db.runAsync('DELETE FROM folders WHERE id = ?', id);

  for (const note of affected) {
    await enqueue('note', note.id, 'update', { folderId: null });
  }
  await enqueue('folder', id, 'delete', {});
  emitChange();
}

// --- Sync support ----------------------------------------------------------

export async function markFolderSynced(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE folders SET sync_status = 'synced' WHERE id = ?", id);
}

/** Writes a folder received from the server, overwriting the local copy. */
export async function upsertRemoteFolder(folder: Folder): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO folders (id, user_id, name, icon, color, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'synced')`,
    [
      folder.id,
      folder.userId,
      folder.name,
      folder.icon,
      folder.color,
      folder.createdAt,
      folder.updatedAt,
    ],
  );
  emitChange();
}

/** Reassigns local-only folders to a signed-in user. Returns their ids. */
export async function claimFoldersForUser(uid: string): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM folders WHERE user_id = 'local-user'",
  );
  if (rows.length > 0) {
    await db.runAsync("UPDATE folders SET user_id = ? WHERE user_id = 'local-user'", uid);
  }
  emitChange();
  return rows.map((r) => r.id);
}
