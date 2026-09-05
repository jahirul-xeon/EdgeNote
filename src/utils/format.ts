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
 * Apple Notes–style section label for grouping notes: Today, Yesterday,
 * Previous 7 Days, Previous 30 Days, then the month (and year for older notes).
 * The exact date/time of each note is still shown on its row.
 */
export function dateGroupLabel(timestamp: number, now: number = Date.now()): string {
  const startOf = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const diffDays = Math.round((startOf(now) - startOf(timestamp)) / DAY);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return 'Previous 7 Days';
  if (diffDays <= 30) return 'Previous 30 Days';
  const date = new Date(timestamp);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' });
}
