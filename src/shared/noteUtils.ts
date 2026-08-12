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

export function filterNotes(notes: StickyNote[], query: string): StickyNote[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') return notes;
  return notes.filter((note) => {
    const inContent = note.content.toLowerCase().includes(trimmed);
    const inTags = note.tags.some((tag) => tag.toLowerCase().includes(trimmed));
    return inContent || inTags;
  });
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
