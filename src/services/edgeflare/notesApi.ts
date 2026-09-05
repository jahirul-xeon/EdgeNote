/**
 * Remote notes/folders/attachments access over pigo REST — the edgeflare
 * replacement for the old Firestore module. Exports the exact surface the sync
 * engine consumes, so only its import path changes.
 *
 * `owner_uid` is stamped server-side by a BEFORE INSERT trigger (see
 * sql/notes_edgeflare.sql) and enforced by RLS, so the client never sends it.
 * Timestamps are epoch-millis BIGINTs matching the local schema, keeping
 * last-writer-wins comparison trivial.
 */
import { list, remove, upsertById } from '@/services/edgeflare/rest';
import type { Attachment } from '@/types/attachment';
import type { Folder } from '@/types/folder';
import type { Note } from '@/types/note';

/** A note plus its (uploaded) attachment metadata. */
export type RemoteNote = { note: Note; attachments: Attachment[] };

// ── Row shapes (snake_case, as pigo returns them) ────────────────────
type NoteRow = {
  id: string;
  title: string | null;
  content: string | null;
  blocks_json: string | null;
  content_format: Note['contentFormat'] | null;
  folder_id: string | null;
  tags: string[] | null;
  is_pinned: boolean | null;
  is_locked: boolean | null;
  is_deleted: boolean | null;
  created_at: number | string | null;
  updated_at: number | string | null;
  deleted_at: number | string | null;
  sync_version: number | null;
  device_id: string | null;
};

type FolderRow = {
  id: string;
  name: string | null;
  icon: string | null;
  color: string | null;
  created_at: number | string | null;
  updated_at: number | string | null;
};

type AttachmentRow = {
  id: string;
  note_id: string;
  type: Attachment['type'] | null;
  remote_url: string | null;
  storage_path: string | null;
  name: string | null;
  mime_type: string | null;
  size: number | string | null;
  width: number | string | null;
  height: number | string | null;
  created_at: number | string | null;
};

const num = (v: unknown, fallback = 0): number => (v == null ? fallback : Number(v));
const nullableNum = (v: unknown): number | null => (v == null ? null : Number(v));

// ── Notes ────────────────────────────────────────────────────────────
function noteToBody(note: Note): Record<string, unknown> {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    blocks_json: note.blocksJson,
    content_format: note.contentFormat,
    folder_id: note.folderId,
    tags: note.tags,
    is_pinned: note.isPinned,
    is_locked: note.isLocked,
    is_deleted: note.isDeleted,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
    deleted_at: note.deletedAt,
    sync_version: note.syncVersion,
    device_id: note.deviceId,
  };
}

function rowToNote(uid: string, row: NoteRow): Note {
  return {
    id: row.id,
    userId: uid,
    title: row.title ?? '',
    content: row.content ?? '',
    blocksJson: row.blocks_json ?? null,
    contentFormat: row.content_format ?? 'plain',
    folderId: row.folder_id ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    isPinned: Boolean(row.is_pinned),
    isLocked: Boolean(row.is_locked),
    isDeleted: Boolean(row.is_deleted),
    createdAt: num(row.created_at, Date.now()),
    updatedAt: num(row.updated_at, Date.now()),
    deletedAt: nullableNum(row.deleted_at),
    syncStatus: 'synced',
    syncVersion: num(row.sync_version),
    deviceId: row.device_id ?? '',
  };
}

function attachmentToBody(a: Attachment): Record<string, unknown> {
  return {
    id: a.id,
    note_id: a.noteId,
    type: a.type,
    remote_url: a.remoteUrl,
    storage_path: a.storagePath,
    name: a.name,
    mime_type: a.mimeType,
    size: a.size,
    width: a.width,
    height: a.height,
    created_at: a.createdAt,
  };
}

function rowToAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    noteId: row.note_id,
    type: row.type ?? 'file',
    localUri: null,
    remoteUrl: row.remote_url ?? null,
    storagePath: row.storage_path ?? null,
    name: row.name ?? null,
    mimeType: row.mime_type ?? null,
    size: nullableNum(row.size),
    width: nullableNum(row.width),
    height: nullableNum(row.height),
    uploadStatus: 'uploaded',
    createdAt: num(row.created_at, Date.now()),
  };
}

/** Upsert a note and its uploaded attachments. `uid` is implied by the token. */
export async function setRemoteNote(
  _uid: string,
  note: Note,
  attachments: Attachment[] = [],
): Promise<void> {
  await upsertById<NoteRow>('notes', note.id, noteToBody(note));
  // Only attachments already uploaded carry a URL other devices can use.
  for (const a of attachments.filter((x) => x.remoteUrl)) {
    await upsertById<AttachmentRow>('attachments', a.id, attachmentToBody(a));
  }
}

export async function deleteRemoteNote(_uid: string, id: string): Promise<void> {
  // Attachments cascade via the FK (ON DELETE CASCADE).
  await remove('notes', { id: `eq.${id}` });
}

/** Remote notes (with attachment metadata) changed strictly after `since`. */
export async function fetchRemoteNotesSince(uid: string, since: number): Promise<RemoteNote[]> {
  return fetchRemoteNotes(uid, { updated_at: `gt.${since}`, order: 'updated_at.asc' });
}

/** Every remote note owned by `uid` — used for a full pull on an empty device. */
export async function fetchAllRemoteNotes(uid: string): Promise<RemoteNote[]> {
  return fetchRemoteNotes(uid, { owner_uid: `eq.${uid}`, order: 'updated_at.asc' });
}

async function fetchRemoteNotes(
  uid: string,
  filters: Record<string, string>,
): Promise<RemoteNote[]> {
  const rows = await list<NoteRow>('notes', filters);
  if (rows.length === 0) return [];

  const notes = rows.map((r) => rowToNote(uid, r));
  const ids = notes.map((n) => n.id);
  // pigo `in` filter: col=in.a,b,c  (no parens, values comma-joined).
  const attachmentRows = await list<AttachmentRow>('attachments', {
    note_id: `in.${ids.join(',')}`,
  });

  const byNote = new Map<string, Attachment[]>();
  for (const ar of attachmentRows) {
    const a = rowToAttachment(ar);
    const bucket = byNote.get(a.noteId) ?? [];
    bucket.push(a);
    byNote.set(a.noteId, bucket);
  }

  return notes.map((note) => ({ note, attachments: byNote.get(note.id) ?? [] }));
}

// ── Folders ──────────────────────────────────────────────────────────
function folderToBody(folder: Folder): Record<string, unknown> {
  return {
    id: folder.id,
    name: folder.name,
    icon: folder.icon,
    color: folder.color,
    created_at: folder.createdAt,
    updated_at: folder.updatedAt,
  };
}

export async function setRemoteFolder(_uid: string, folder: Folder): Promise<void> {
  await upsertById<FolderRow>('folders', folder.id, folderToBody(folder));
}

export async function deleteRemoteFolder(_uid: string, id: string): Promise<void> {
  await remove('folders', { id: `eq.${id}` });
}

export async function fetchRemoteFoldersSince(uid: string, since: number): Promise<Folder[]> {
  return fetchRemoteFolders(uid, { updated_at: `gt.${since}`, order: 'updated_at.asc' });
}

/** Every remote folder owned by `uid` — used for a full pull on an empty device. */
export async function fetchAllRemoteFolders(uid: string): Promise<Folder[]> {
  return fetchRemoteFolders(uid, { owner_uid: `eq.${uid}`, order: 'updated_at.asc' });
}

async function fetchRemoteFolders(
  uid: string,
  filters: Record<string, string>,
): Promise<Folder[]> {
  const rows = await list<FolderRow>('folders', filters);
  return rows.map((row) => ({
    id: row.id,
    userId: uid,
    name: row.name ?? '',
    icon: row.icon ?? null,
    color: row.color ?? null,
    createdAt: num(row.created_at, Date.now()),
    updatedAt: num(row.updated_at, Date.now()),
    syncStatus: 'synced',
    smartRule: null,
  }));
}
