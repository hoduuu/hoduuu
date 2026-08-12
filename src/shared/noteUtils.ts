import type { StickyNote } from './types';

export function normalizeTagInput(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(/[,\s]+/)) {
    const tag = part.trim().replace(/^#/, '');
    if (tag.length === 0 || seen.has(tag)) continue;
    seen.add(tag);
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
  const tagSet = new Set<string>();
  for (const note of notes) {
    for (const tag of note.tags) tagSet.add(tag);
  }
  return [...tagSet].sort((a, b) => a.localeCompare(b));
}
