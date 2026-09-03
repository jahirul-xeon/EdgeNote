import { useEffect, useRef, useState } from 'react';

import { searchNotes } from '@/database/notesRepository';
import type { Note } from '@/types/note';

const DEBOUNCE_MS = 200;

type UseSearchResult = {
  query: string;
  setQuery: (value: string) => void;
  results: Note[];
  searching: boolean;
};

/** Debounced offline search over notes (§17, §52). */
export function useSearch(): UseSearchResult {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Note[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (timer.current) clearTimeout(timer.current);

    if (trimmed.length === 0) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    timer.current = setTimeout(() => {
      let active = true;
      searchNotes(trimmed)
        .then((next) => {
          if (active) {
            setResults(next);
            setSearching(false);
          }
        })
        .catch(() => {
          if (active) setSearching(false);
        });
      return () => {
        active = false;
      };
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  return { query, setQuery, results, searching };
}
