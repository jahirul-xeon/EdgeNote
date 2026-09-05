import { useEffect, useState } from 'react';

import { subscribeToChanges } from '@/database/changeBus';
import { ALL_NOTES_FOLDER, getNotesByFolder, getNotesForSmartRule } from '@/database/notesRepository';
import { getFolder } from '@/database/foldersRepository';
import type { Note } from '@/types/note';

/** Reactive list of active notes in a folder (`'all'` for every note). Smart
 *  folders are populated from their rule instead of manual membership. */
export function useFolderNotes(folderId: string): { notes: Note[]; loading: boolean } {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const run = () => {
      (async () => {
        const folder = folderId !== ALL_NOTES_FOLDER ? await getFolder(folderId) : null;
        return folder?.smartRule
          ? getNotesForSmartRule(folder.smartRule)
          : getNotesByFolder(folderId);
      })()
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
