/**
 * Notes repository.
 *
 * The single place the app reads/writes notes. Screens and hooks call these
 * functions and never touch SQLite directly. Every mutation notifies
 * subscribers so the UI can re-query.
 *
 * Sprint 1 is local-only: there is no auth and no sync engine yet, so notes
 * are owned by a fixed local user and device. Sync metadata columns exist and
 * are populated so that adding the sync engine later requires no migration.
 */
import type * as SQLite from 'expo-sqlite';

import { emitChange } from '@/database/changeBus';
import { getDatabase } from '@/database/database';
import { enqueue } from '@/database/syncRepository';
import type { SmartRule } from '@/types/folder';
import type { CreateNoteInput, Note, UpdateNotePatch } from '@/types/note';
import { getDeviceId } from '@/utils/device';
import { createId } from '@/utils/id';

/**
 * Local-only owner id for notes created before sign-in. On sign-in these are
 * reassigned to the Firebase uid (see `claimNotesForUser`).
 */
const LOCAL_USER_ID = 'local-user';

type NoteRow = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  blocks_json: string | null;
  content_format: string;
  folder_id: string | null;
  tags_json: string;
  is_pinned: number;
  is_locked: number;
  is_deleted: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  sync_status: string;
  sync_version: number;
  device_id: string;
};

function mapRow(row: NoteRow): Note {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(row.tags_json);
    if (Array.isArray(parsed)) tags = parsed;
  } catch {
    // Corrupt tags column — fall back to empty rather than crashing the list.
  }

  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    content: row.content,
    blocksJson: row.blocks_json,
    contentFormat: row.content_format as Note['contentFormat'],
    folderId: row.folder_id,
    tags,
    isPinned: row.is_pinned === 1,
    isLocked: row.is_locked === 1,
    isDeleted: row.is_deleted === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncStatus: row.sync_status as Note['syncStatus'],
    syncVersion: row.sync_version,
    deviceId: row.device_id,
  };
}

// --- Queries ---------------------------------------------------------------

/** Active (non-deleted) notes, pinned first, then most recently edited. */
export async function getNotes(): Promise<Note[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<NoteRow>(
    `SELECT * FROM notes
     WHERE is_deleted = 0
     ORDER BY is_pinned DESC, updated_at DESC`,
  );
  return rows.map(mapRow);
}

/** A single note by id, regardless of deleted state. */
export async function getNote(id: string): Promise<Note | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<NoteRow>('SELECT * FROM notes WHERE id = ?', id);
  return row ? mapRow(row) : null;
}

/** Special folder id meaning "every active note, regardless of folder". */
export const ALL_NOTES_FOLDER = 'all';

/**
 * Active notes in a folder, pinned first then most recently edited.
 * Pass `ALL_NOTES_FOLDER` for every note.
 */
export async function getNotesByFolder(folderId: string): Promise<Note[]> {
  const db = await getDatabase();
  if (folderId === ALL_NOTES_FOLDER) {
    return getNotes();
  }
  const rows = await db.getAllAsync<NoteRow>(
    `SELECT * FROM notes
     WHERE is_deleted = 0 AND folder_id = ?
     ORDER BY is_pinned DESC, updated_at DESC`,
    folderId,
  );
  return rows.map(mapRow);
}

/** Builds the WHERE fragment (minus `is_deleted = 0`) for a smart-folder rule. */
function smartRuleWhere(rule: SmartRule): { clause: string; params: (string | number)[] } {
  switch (rule.type) {
    case 'keyword': {
      const like = `%${escapeLike(rule.value)}%`;
      return {
        clause: "(title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')",
        params: [like, like],
      };
    }
    case 'has-attachment':
      return { clause: 'id IN (SELECT DISTINCT note_id FROM attachments)', params: [] };
    case 'recent':
      return { clause: 'updated_at >= ?', params: [Date.now() - rule.days * 86_400_000] };
    case 'pinned':
      return { clause: 'is_pinned = 1', params: [] };
  }
}

/** Active notes matching a smart-folder rule (same ordering as a folder view). */
export async function getNotesForSmartRule(rule: SmartRule): Promise<Note[]> {
  const db = await getDatabase();
  const { clause, params } = smartRuleWhere(rule);
  const rows = await db.getAllAsync<NoteRow>(
    `SELECT * FROM notes WHERE is_deleted = 0 AND ${clause}
     ORDER BY is_pinned DESC, updated_at DESC`,
    params,
  );
  return rows.map(mapRow);
}

/** Count of active notes matching a smart-folder rule. */
export async function countNotesForSmartRule(rule: SmartRule): Promise<number> {
  const db = await getDatabase();
  const { clause, params } = smartRuleWhere(rule);
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM notes WHERE is_deleted = 0 AND ${clause}`,
    params,
  );
  return row?.c ?? 0;
}

/** Full-text-ish search over active notes' title and content (offline, §17). */
export async function searchNotes(query: string): Promise<Note[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const db = await getDatabase();
  const like = `%${escapeLike(trimmed)}%`;
  const rows = await db.getAllAsync<NoteRow>(
    `SELECT * FROM notes
     WHERE is_deleted = 0
       AND (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')
     ORDER BY is_pinned DESC, updated_at DESC`,
    [like, like],
  );
  return rows.map(mapRow);
}

/** Soft-deleted notes for the Recently Deleted screen, newest deletion first. */
export async function getDeletedNotes(): Promise<Note[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<NoteRow>(
    `SELECT * FROM notes
     WHERE is_deleted = 1
     ORDER BY deleted_at DESC`,
  );
  return rows.map(mapRow);
}

/** Count of active notes not in any folder (the "All Notes" total). */
export async function getActiveNotesCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM notes WHERE is_deleted = 0',
  );
  return row?.count ?? 0;
}

export async function getDeletedNotesCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM notes WHERE is_deleted = 1',
  );
  return row?.count ?? 0;
}

/** Map of folderId → active note count, for the folders list. */
export async function getNoteCountsByFolder(): Promise<Record<string, number>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ folder_id: string | null; count: number }>(
    `SELECT folder_id, COUNT(*) AS count FROM notes
     WHERE is_deleted = 0 AND folder_id IS NOT NULL
     GROUP BY folder_id`,
  );
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row.folder_id) counts[row.folder_id] = row.count;
  }
  return counts;
}

/** Escapes LIKE wildcards so a user typing % or _ searches literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// --- Mutations -------------------------------------------------------------

export async function createNote(input: CreateNoteInput = {}): Promise<Note> {
  const db = await getDatabase();
  const now = Date.now();
  const note: Note = {
    id: createId('note'),
    userId: LOCAL_USER_ID,
    title: input.title ?? '',
    content: input.content ?? '',
    blocksJson: null,
    contentFormat: 'plain',
    folderId: input.folderId ?? null,
    tags: [],
    isPinned: false,
    isLocked: false,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncStatus: 'pending',
    syncVersion: 0,
    deviceId: await getDeviceId(),
  };

  await db.runAsync(
    `INSERT INTO notes (
       id, user_id, title, content, content_format, folder_id, tags_json,
       is_pinned, is_locked, is_deleted, created_at, updated_at, deleted_at,
       sync_status, sync_version, device_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      note.id,
      note.userId,
      note.title,
      note.content,
      note.contentFormat,
      note.folderId,
      JSON.stringify(note.tags),
      0,
      0,
      0,
      note.createdAt,
      note.updatedAt,
      null,
      note.syncStatus,
      note.syncVersion,
      note.deviceId,
    ],
  );

  await enqueue('note', note.id, 'create', {
    title: note.title,
    content: note.content,
    folderId: note.folderId,
  });
  emitChange();
  return note;
}

/** Patches mutable fields and bumps updated_at. No-op if nothing changed. */
export async function updateNote(id: string, patch: UpdateNotePatch): Promise<void> {
  const db = await getDatabase();

  const sets: string[] = [];
  const params: SQLite.SQLiteBindValue[] = [];

  if (patch.title !== undefined) {
    sets.push('title = ?');
    params.push(patch.title);
  }
  if (patch.content !== undefined) {
    sets.push('content = ?');
    params.push(patch.content);
  }
  if (patch.blocks !== undefined) {
    sets.push('blocks_json = ?', "content_format = 'rich'");
    params.push(JSON.stringify(patch.blocks));
  }
  if (patch.folderId !== undefined) {
    sets.push('folder_id = ?');
    params.push(patch.folderId);
  }
  if (patch.tags !== undefined) {
    sets.push('tags_json = ?');
    params.push(JSON.stringify(patch.tags));
  }
  if (patch.isPinned !== undefined) {
    sets.push('is_pinned = ?');
    params.push(patch.isPinned ? 1 : 0);
  }
  if (patch.isLocked !== undefined) {
    sets.push('is_locked = ?');
    params.push(patch.isLocked ? 1 : 0);
  }

  if (sets.length === 0) return;

  // Mark pending so the future sync engine picks the change up.
  sets.push('updated_at = ?', "sync_status = 'pending'", 'sync_version = sync_version + 1');
  params.push(Date.now());
  params.push(id);

  await db.runAsync(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`, params);
  await enqueue('note', id, 'update', patch as Record<string, unknown>);
  emitChange();
}

/** Soft delete: moves a note to Recently Deleted. */
export async function deleteNote(id: string): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    `UPDATE notes
     SET is_deleted = 1, deleted_at = ?, updated_at = ?,
         sync_status = 'pending', sync_version = sync_version + 1
     WHERE id = ?`,
    [now, now, id],
  );
  // A soft delete is an update on the remote (isDeleted flag), not a hard delete.
  await enqueue('note', id, 'update', { isDeleted: true, deletedAt: now });
  emitChange();
}

/** Restores a soft-deleted note back to the active list. */
export async function restoreNote(id: string): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    `UPDATE notes
     SET is_deleted = 0, deleted_at = NULL, updated_at = ?,
         sync_status = 'pending', sync_version = sync_version + 1
     WHERE id = ?`,
    [now, id],
  );
  await enqueue('note', id, 'update', { isDeleted: false, deletedAt: null });
  emitChange();
}

/** Hard delete: permanently removes a note row. */
export async function permanentlyDeleteNote(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM attachments WHERE note_id = ?', id);
  await db.runAsync('DELETE FROM notes WHERE id = ?', id);
  await enqueue('note', id, 'delete', {});
  emitChange();
}

/** Permanently removes every soft-deleted note (Empty Trash). */
export async function emptyTrash(): Promise<void> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM notes WHERE is_deleted = 1');
  await db.runAsync('DELETE FROM notes WHERE is_deleted = 1');
  for (const row of rows) {
    await enqueue('note', row.id, 'delete', {});
  }
  emitChange();
}

/** Moves a note into a folder, or to All Notes when `folderId` is null. */
export async function moveNote(id: string, folderId: string | null): Promise<void> {
  await updateNote(id, { folderId });
}

export async function setPinned(id: string, isPinned: boolean): Promise<void> {
  await updateNote(id, { isPinned });
}

export async function setLocked(id: string, isLocked: boolean): Promise<void> {
  await updateNote(id, { isLocked });
}

// --- Sync support ----------------------------------------------------------
// These bypass the sync queue: they apply remote truth or bookkeeping and must
// not re-enqueue changes (that would create an echo loop).

export async function markNoteSynced(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE notes SET sync_status = 'synced' WHERE id = ?", id);
}

/** Writes a note received from the server, overwriting the local copy. */
export async function upsertRemoteNote(note: Note): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO notes (
       id, user_id, title, content, blocks_json, content_format, folder_id, tags_json,
       is_pinned, is_locked, is_deleted, created_at, updated_at, deleted_at,
       sync_status, sync_version, device_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?)`,
    [
      note.id,
      note.userId,
      note.title,
      note.content,
      note.blocksJson,
      note.contentFormat,
      note.folderId,
      JSON.stringify(note.tags),
      note.isPinned ? 1 : 0,
      note.isLocked ? 1 : 0,
      note.isDeleted ? 1 : 0,
      note.createdAt,
      note.updatedAt,
      note.deletedAt,
      note.syncVersion,
      note.deviceId,
    ],
  );
  emitChange();
}

/** Reassigns local-only notes to a signed-in user. Returns their ids. */
export async function claimNotesForUser(uid: string): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM notes WHERE user_id = 'local-user'",
  );
  if (rows.length > 0) {
    await db.runAsync("UPDATE notes SET user_id = ? WHERE user_id = 'local-user'", uid);
  }
  emitChange();
  return rows.map((r) => r.id);
}
