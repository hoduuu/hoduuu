import type { StickyNote } from './types';

export function normalizeTagInput(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(/[,\s]+/)) {
    const tag = part.trim().replace(/^#/, '');
    if (tag.length === 0) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

export function addTag(tags: string[], raw: string): string[] {
  const tag = raw.trim().replace(/^#/, '');
  if (tag.length === 0) return tags;
  if (tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return tags;
  return [...tags, tag];
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Today's notes show date + time; once a note is no longer from today, the time is dropped
// since it stops being meaningful at a glance and only the date remains useful.
export function formatNoteDate(timestamp: number, now: number = Date.now()): string {
  const created = new Date(timestamp);
  const date = `${created.getFullYear()}.${String(created.getMonth() + 1).padStart(2, '0')}.${String(created.getDate()).padStart(2, '0')}`;
  if (!isSameDay(created, new Date(now))) return date;
  const time = `${String(created.getHours()).padStart(2, '0')}:${String(created.getMinutes()).padStart(2, '0')}`;
  return `${date} ${time}`;
}

export function filterNotes(notes: StickyNote[], query: string): StickyNote[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') return notes;
  return notes.filter((note) => {
    const inContent = note.content.toLowerCase().includes(trimmed);
    const inTags = note.tags.some((tag) => tag.toLowerCase().includes(trimmed));
    return inContent || inTags;
  });
}

// Maps each tag to the color of the first note (in list order) that carries it, matching the
// same first-seen rule collectAllTags uses for casing — a tag can appear on notes of different
// colors, and there is no "correct" one, so the earliest note wins deterministically.
export function collectTagColors(notes: StickyNote[]): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const note of notes) {
    for (const tag of note.tags) {
      const key = tag.toLowerCase();
      if (!(key in colors)) colors[key] = note.color;
    }
  }
  return colors;
}

export function collectAllTags(notes: StickyNote[]): string[] {
  const seen = new Map<string, string>();
  for (const note of notes) {
    for (const tag of note.tags) {
      const key = tag.toLowerCase();
      if (!seen.has(key)) seen.set(key, tag);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
