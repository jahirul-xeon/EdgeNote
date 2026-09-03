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
import type { Folder } from '@/types/folder';
import type { Note } from '@/types/note';

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

function serializeNote(note: Note) {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
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
  };
}

export async function setRemoteNote(uid: string, note: Note): Promise<void> {
  await setDoc(doc(notesCollection(uid), note.id), serializeNote(note));
}

export async function deleteRemoteNote(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(notesCollection(uid), id));
}

/** Remote notes changed strictly after `since` (epoch ms). */
export async function fetchRemoteNotesSince(uid: string, since: number): Promise<Note[]> {
  const snapshot = await getDocs(query(notesCollection(uid), where('updatedAt', '>', since)));
  return snapshot.docs.map((d) => deserializeNote(uid, d.data()));
}

function deserializeNote(uid: string, data: Record<string, unknown>): Note {
  return {
    id: String(data.id),
    userId: uid,
    title: String(data.title ?? ''),
    content: String(data.content ?? ''),
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
    };
  });
}
