/**
 * Presentation helpers for notes.
 *
 * The note body is a single text blob (like Apple Notes): the first non-empty
 * line acts as the title, the remainder is the preview. Storing them derived
 * keeps the editor a single text field while the list still shows a title.
 */

/** First non-empty line of the note, used as its title. Empty string if none. */
export function deriveTitle(content: string): string {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return '';
}

/** Everything after the title line, collapsed to a single-line preview. */
export function derivePreview(content: string): string {
  const lines = content.split('\n');
  let titleFound = false;
  const rest: string[] = [];
  for (const line of lines) {
    if (!titleFound) {
      if (line.trim().length > 0) {
        titleFound = true;
      }
      continue;
    }
    rest.push(line);
  }
  return rest.join(' ').replace(/\s+/g, ' ').trim();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** iOS-style relative timestamp: "10:32 AM", "Yesterday", "Monday", "12/3/25". */
export function relativeTime(timestamp: number, now: number = Date.now()): string {
  const date = new Date(timestamp);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfNote = new Date(timestamp);
  startOfNote.setHours(0, 0, 0, 0);

  const dayDiff = Math.round((startOfToday.getTime() - startOfNote.getTime()) / DAY);

  if (dayDiff <= 0) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  if (dayDiff === 1) {
    return 'Yesterday';
  }
  if (dayDiff < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return date.toLocaleDateString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  });
}

/**
 * Section label for grouping notes by day: "Today", "Yesterday", then the full
 * date ("September 6, 2026").
 */
export function dateGroupLabel(timestamp: number, now: number = Date.now()): string {
  const startOf = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const today = startOf(now);
  const day = startOf(timestamp);
  if (day === today) return 'Today';
  if (day === today - DAY) return 'Yesterday';
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
