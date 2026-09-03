import { useEffect, useState } from 'react';

import { subscribeToChanges } from '@/database/changeBus';
import { getNotesByFolder } from '@/database/notesRepository';
import type { Note } from '@/types/note';

/** Reactive list of active notes in a folder (`'all'` for every note). */
export function useFolderNotes(folderId: string): { notes: Note[]; loading: boolean } {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const run = () => {
      getNotesByFolder(folderId)
        .then((next) => {
          if (!active) return;
          setNotes(next);
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
  }, [folderId]);

  return { notes, loading };
}
