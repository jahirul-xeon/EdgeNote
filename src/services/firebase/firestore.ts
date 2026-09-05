/**
 * Firestore remote data access (§47). Notes and folders live under
 * users/{uid}/... . Timestamps are stored as epoch-millis numbers so ordering
 * and conflict comparison are trivial and match the local schema.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';

import { getDb } from '@/services/firebase/firebaseConfig';
import type { Attachment } from '@/types/attachment';
import type { Folder } from '@/types/folder';
import type { Note } from '@/types/note';

/** A note plus its attachment metadata, as stored in one Firestore document. */
export type RemoteNote = { note: Note; attachments: Attachment[] };

/** Writes the user's profile document (§5). Merges so it can be updated later. */
export async function setUserProfile(
  uid: string,
  profile: { email: string | null; displayName: string; firstName: string; lastName: string },
): Promise<void> {
  await setDoc(
    doc(getDb(), 'users', uid),
    { ...profile, updatedAt: Date.now(), createdAt: Date.now() },
    { merge: true },
  );
}

function notesCollection(uid: string) {
  return collection(getDb(), 'users', uid, 'notes');
}
function foldersCollection(uid: string) {
  return collection(getDb(), 'users', uid, 'folders');
}

function serializeAttachmentMeta(a: Attachment) {
  // Device-local fields (localUri, uploadStatus) are intentionally omitted.
  return {
    id: a.id,
    noteId: a.noteId,
    type: a.type,
    remoteUrl: a.remoteUrl,
    storagePath: a.storagePath,
    name: a.name,
    mimeType: a.mimeType,
    size: a.size,
    width: a.width,
    height: a.height,
    createdAt: a.createdAt,
  };
}

function serializeNote(note: Note, attachments: Attachment[]) {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    blocksJson: note.blocksJson,
    contentFormat: note.contentFormat,
    folderId: note.folderId,
    tags: note.tags,
    isPinned: note.isPinned,
    isLocked: note.isLocked,
    isDeleted: note.isDeleted,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    deletedAt: note.deletedAt,
    syncVersion: note.syncVersion,
    deviceId: note.deviceId,
    // Only attachments already uploaded carry a usable remoteUrl for other devices.
    attachments: attachments.filter((a) => a.remoteUrl).map(serializeAttachmentMeta),
  };
}

export async function setRemoteNote(
  uid: string,
  note: Note,
  attachments: Attachment[] = [],
): Promise<void> {
  await setDoc(doc(notesCollection(uid), note.id), serializeNote(note, attachments));
}

export async function deleteRemoteNote(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(notesCollection(uid), id));
}

/** Remote notes (with attachment metadata) changed strictly after `since`. */
export async function fetchRemoteNotesSince(uid: string, since: number): Promise<RemoteNote[]> {
  const snapshot = await getDocs(query(notesCollection(uid), where('updatedAt', '>', since)));
  return snapshot.docs.map((d) => deserializeNote(uid, d.data()));
}

function deserializeNote(uid: string, data: Record<string, unknown>): RemoteNote {
  const note: Note = {
    id: String(data.id),
    userId: uid,
    title: String(data.title ?? ''),
    content: String(data.content ?? ''),
    blocksJson: (data.blocksJson as string | null) ?? null,
    contentFormat: (data.contentFormat as Note['contentFormat']) ?? 'plain',
    folderId: (data.folderId as string | null) ?? null,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    isPinned: Boolean(data.isPinned),
    isLocked: Boolean(data.isLocked),
    isDeleted: Boolean(data.isDeleted),
    createdAt: Number(data.createdAt ?? Date.now()),
    updatedAt: Number(data.updatedAt ?? Date.now()),
    deletedAt: data.deletedAt != null ? Number(data.deletedAt) : null,
    syncStatus: 'synced',
    syncVersion: Number(data.syncVersion ?? 0),
    deviceId: String(data.deviceId ?? ''),
  };
  const rawAttachments = Array.isArray(data.attachments) ? data.attachments : [];
  const attachments: Attachment[] = rawAttachments.map((raw) => {
    const a = raw as Record<string, unknown>;
    return {
      id: String(a.id),
      noteId: note.id,
      type: (a.type as Attachment['type']) ?? 'file',
      localUri: null,
      remoteUrl: (a.remoteUrl as string | null) ?? null,
      storagePath: (a.storagePath as string | null) ?? null,
      name: (a.name as string | null) ?? null,
      mimeType: (a.mimeType as string | null) ?? null,
      size: a.size != null ? Number(a.size) : null,
      width: a.width != null ? Number(a.width) : null,
      height: a.height != null ? Number(a.height) : null,
      uploadStatus: 'uploaded',
      createdAt: Number(a.createdAt ?? Date.now()),
    };
  });
  return { note, attachments };
}

function serializeFolder(folder: Folder) {
  return {
    id: folder.id,
    name: folder.name,
    icon: folder.icon,
    color: folder.color,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}

export async function setRemoteFolder(uid: string, folder: Folder): Promise<void> {
  await setDoc(doc(foldersCollection(uid), folder.id), serializeFolder(folder));
}

export async function deleteRemoteFolder(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(foldersCollection(uid), id));
}

export async function fetchRemoteFoldersSince(uid: string, since: number): Promise<Folder[]> {
  const snapshot = await getDocs(query(foldersCollection(uid), where('updatedAt', '>', since)));
  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: String(data.id),
      userId: uid,
      name: String(data.name ?? ''),
      icon: (data.icon as string | null) ?? null,
      color: (data.color as string | null) ?? null,
      createdAt: Number(data.createdAt ?? Date.now()),
      updatedAt: Number(data.updatedAt ?? Date.now()),
      syncStatus: 'synced',
      smartRule: null,
    };
  });
}
