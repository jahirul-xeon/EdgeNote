/**
 * Core note types for the local-first notes app.
 *
 * The local SQLite database is the source of immediate truth. These types
 * describe the in-app shape of a note; the on-disk row shape is mapped in
 * `src/database/notesRepository.ts`.
 */

export type ContentFormat = 'plain' | 'rich' | 'markdown';

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'failed';

export type Note = {
  id: string;
  userId: string;
  title: string;
  content: string;
  contentFormat: ContentFormat;
  folderId: string | null;
  tags: string[];
  isPinned: boolean;
  isLocked: boolean;
  isDeleted: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  syncStatus: SyncStatus;
  syncVersion: number;
  deviceId: string;
};

/** Fields a caller may provide when creating a note. Everything else is defaulted. */
export type CreateNoteInput = {
  title?: string;
  content?: string;
  folderId?: string | null;
};

/** Mutable fields a caller may patch on an existing note. */
export type UpdateNotePatch = Partial<
  Pick<Note, 'title' | 'content' | 'folderId' | 'tags' | 'isPinned' | 'isLocked'>
>;
