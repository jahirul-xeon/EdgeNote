/**
 * Sync engine (§9, §31). Pushes the local change queue to Firestore, then pulls
 * remote changes and resolves conflicts. A single run executes at a time (§10);
 * a request that arrives mid-run schedules exactly one more pass.
 *
 * The local SQLite store remains the source of immediate truth — this only
 * mirrors it to and from the cloud in the background (§75).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  claimFoldersForUser,
  getFolder,
  markFolderSynced,
  upsertRemoteFolder,
} from '@/database/foldersRepository';
import {
  claimNotesForUser,
  getNote,
  markNoteSynced,
  upsertRemoteNote,
} from '@/database/notesRepository';
import {
  enqueue,
  getDueSyncItems,
  getPendingSyncCount,
  recordSyncFailure,
  removeSyncItem,
} from '@/database/syncRepository';
import {
  deleteRemoteFolder,
  deleteRemoteNote,
  fetchRemoteFoldersSince,
  fetchRemoteNotesSince,
  setRemoteFolder,
  setRemoteNote,
} from '@/services/firebase/firestore';
import { getNetworkState } from '@/services/network/networkMonitor';
import { remoteWins } from '@/services/sync/conflictResolver';
import { setSyncState } from '@/services/sync/syncStatus';

let running = false;
let rerunRequested = false;

function lastSyncKey(uid: string): string {
  return `sync:lastSyncAt:${uid}`;
}

async function getLastSyncAt(uid: string): Promise<number> {
  try {
    const value = await AsyncStorage.getItem(lastSyncKey(uid));
    return value ? Number(value) : 0;
  } catch {
    return 0;
  }
}

async function setLastSyncAt(uid: string, value: number): Promise<void> {
  try {
    await AsyncStorage.setItem(lastSyncKey(uid), String(value));
  } catch {
    // Non-fatal: a missed persist just re-pulls some rows next time.
  }
}

/** On sign-in, adopt local-only notes/folders and queue them to push. */
export async function claimLocalData(uid: string): Promise<void> {
  const noteIds = await claimNotesForUser(uid);
  for (const id of noteIds) await enqueue('note', id, 'update', {});
  const folderIds = await claimFoldersForUser(uid);
  for (const id of folderIds) await enqueue('folder', id, 'update', {});
}

/** Requests a sync. Coalesces concurrent requests into a single run + one rerun. */
export async function requestSync(uid: string): Promise<void> {
  if (running) {
    rerunRequested = true;
    return;
  }
  running = true;
  try {
    do {
      rerunRequested = false;
      await runOnce(uid);
    } while (rerunRequested);
  } finally {
    running = false;
  }
}

async function runOnce(uid: string): Promise<void> {
  const net = getNetworkState();
  if (!net.isConnected || !net.isInternetReachable) {
    setSyncState({ phase: 'offline', pendingCount: await getPendingSyncCount() });
    return;
  }

  setSyncState({ phase: 'syncing' });
  try {
    await pushLocalChanges(uid);
    await pullRemoteChanges(uid);
    setSyncState({
      phase: 'idle',
      lastSyncAt: Date.now(),
      pendingCount: await getPendingSyncCount(),
    });
  } catch {
    setSyncState({ phase: 'error', pendingCount: await getPendingSyncCount() });
  }
}

async function pushLocalChanges(uid: string): Promise<void> {
  const items = await getDueSyncItems();
  for (const item of items) {
    try {
      if (item.entityType === 'note') {
        if (item.operation === 'delete') {
          await deleteRemoteNote(uid, item.entityId);
        } else {
          const note = await getNote(item.entityId);
          if (!note) {
            await deleteRemoteNote(uid, item.entityId);
          } else {
            await setRemoteNote(uid, { ...note, userId: uid });
            await markNoteSynced(note.id);
          }
        }
      } else {
        if (item.operation === 'delete') {
          await deleteRemoteFolder(uid, item.entityId);
        } else {
          const folder = await getFolder(item.entityId);
          if (!folder) {
            await deleteRemoteFolder(uid, item.entityId);
          } else {
            await setRemoteFolder(uid, { ...folder, userId: uid });
            await markFolderSynced(folder.id);
          }
        }
      }
      await removeSyncItem(item.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordSyncFailure(item.id, item.retryCount, message);
    }
  }
}

async function pullRemoteChanges(uid: string): Promise<void> {
  const since = await getLastSyncAt(uid);
  const [folders, notes] = await Promise.all([
    fetchRemoteFoldersSince(uid, since),
    fetchRemoteNotesSince(uid, since),
  ]);

  let maxUpdated = since;

  for (const remote of folders) {
    const local = await getFolder(remote.id);
    const localCmp = local
      ? { updatedAt: local.updatedAt, syncVersion: 0, deviceId: '' }
      : null;
    const remoteCmp = { updatedAt: remote.updatedAt, syncVersion: 0, deviceId: '' };
    if (!localCmp || remoteWins(localCmp, remoteCmp)) {
      await upsertRemoteFolder(remote);
    }
    maxUpdated = Math.max(maxUpdated, remote.updatedAt);
  }

  for (const remote of notes) {
    const local = await getNote(remote.id);
    if (!local || remoteWins(local, remote)) {
      await upsertRemoteNote(remote);
    }
    maxUpdated = Math.max(maxUpdated, remote.updatedAt);
  }

  await setLastSyncAt(uid, maxUpdated);
}
