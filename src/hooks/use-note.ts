/**
 * Loads a single note by id once. The editor owns the note's text in local
 * component state after loading (so typing never waits on SQLite); this hook
 * just provides the initial value and a loading flag.
 */
import { useEffect, useState } from 'react';

import { getNote } from '@/database/notesRepository';
import type { Note } from '@/types/note';

type UseNoteResult = {
  note: Note | null;
  loading: boolean;
};

export function useNote(id: string | undefined): UseNoteResult {
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!id) {
      setLoading(false);
      return;
    }
    getNote(id)
      .then((result) => {
        if (active) {
          setNote(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  return { note, loading };
}
