import { useEffect, useState } from 'react';

import { subscribeToChanges } from '@/database/changeBus';
import { getFolders } from '@/database/foldersRepository';
import {
  getActiveNotesCount,
  getDeletedNotesCount,
} from '@/database/notesRepository';
import type { FolderWithCount } from '@/types/folder';

type UseFoldersResult = {
  folders: FolderWithCount[];
  allNotesCount: number;
  trashCount: number;
  loading: boolean;
};

/** Reactive folder list plus the All Notes and Recently Deleted counts. */
export function useFolders(): UseFoldersResult {
  const [folders, setFolders] = useState<FolderWithCount[]>([]);
  const [allNotesCount, setAllNotesCount] = useState(0);
  const [trashCount, setTrashCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const run = () => {
      Promise.all([getFolders(), getActiveNotesCount(), getDeletedNotesCount()])
        .then(([nextFolders, allCount, deletedCount]) => {
          if (!active) return;
          setFolders(nextFolders);
          setAllNotesCount(allCount);
          setTrashCount(deletedCount);
          setLoading(false);
        })
        .catch(() => {
          if (active) setLoading(false);
        });
    };
    run();
    const unsubscribe = subscribeToChanges(run);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { folders, allNotesCount, trashCount, loading };
}
