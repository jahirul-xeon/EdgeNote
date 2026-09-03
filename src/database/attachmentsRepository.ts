/**
 * Attachments repository. Local-first: an attachment row is created with a
 * persisted `localUri` and displayed immediately; upload to Firebase Storage
 * happens later in the background (§22).
 */
import { emitChange } from '@/database/changeBus';
import { getDatabase } from '@/database/database';
import type { Attachment, AttachmentType, UploadStatus } from '@/types/attachment';

type AttachmentRow = {
  id: string;
  note_id: string;
  type: string;
  local_uri: string | null;
  remote_url: string | null;
  storage_path: string | null;
  name: string | null;
  mime_type: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  upload_status: string;
  created_at: number;
};

function mapRow(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    noteId: row.note_id,
    type: row.type as AttachmentType,
    localUri: row.local_uri,
    remoteUrl: row.remote_url,
    storagePath: row.storage_path,
    name: row.name,
    mimeType: row.mime_type,
    size: row.size,
    width: row.width,
    height: row.height,
    uploadStatus: row.upload_status as UploadStatus,
    createdAt: row.created_at,
  };
}

export async function getAttachmentsByNote(noteId: string): Promise<Attachment[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<AttachmentRow>(
    'SELECT * FROM attachments WHERE note_id = ? ORDER BY created_at ASC',
    noteId,
  );
  return rows.map(mapRow);
}

export async function getAttachment(id: string): Promise<Attachment | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AttachmentRow>('SELECT * FROM attachments WHERE id = ?', id);
  return row ? mapRow(row) : null;
}

export async function insertAttachment(attachment: Attachment): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO attachments (
       id, note_id, type, local_uri, remote_url, storage_path, name, mime_type,
       size, width, height, upload_status, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      attachment.id,
      attachment.noteId,
      attachment.type,
      attachment.localUri,
      attachment.remoteUrl,
      attachment.storagePath,
      attachment.name,
      attachment.mimeType,
      attachment.size,
      attachment.width,
      attachment.height,
      attachment.uploadStatus,
      attachment.createdAt,
    ],
  );
  emitChange();
}

/** Upsert used when pulling attachment metadata from the note's remote doc. */
export async function upsertAttachment(attachment: Attachment): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO attachments (
       id, note_id, type, local_uri, remote_url, storage_path, name, mime_type,
       size, width, height, upload_status, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      attachment.id,
      attachment.noteId,
      attachment.type,
      attachment.localUri,
      attachment.remoteUrl,
      attachment.storagePath,
      attachment.name,
      attachment.mimeType,
      attachment.size,
      attachment.width,
      attachment.height,
      attachment.uploadStatus,
      attachment.createdAt,
    ],
  );
  emitChange();
}

export async function setUploadStatus(id: string, status: UploadStatus): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE attachments SET upload_status = ? WHERE id = ?', [status, id]);
  emitChange();
}

export async function markAttachmentUploaded(
  id: string,
  remoteUrl: string,
  storagePath: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE attachments SET remote_url = ?, storage_path = ?, upload_status = 'uploaded' WHERE id = ?",
    [remoteUrl, storagePath, id],
  );
  emitChange();
}

export async function deleteAttachment(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM attachments WHERE id = ?', id);
  emitChange();
}

/** Attachments with a local file still awaiting (or retrying) upload. */
export async function getPendingUploads(): Promise<Attachment[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<AttachmentRow>(
    "SELECT * FROM attachments WHERE upload_status IN ('pending', 'failed') AND local_uri IS NOT NULL ORDER BY created_at ASC",
  );
  return rows.map(mapRow);
}
