import { describe, it, expect } from 'vitest';
import {
  filterNotes,
  collectAllTags,
  collectTagColors,
  addTag,
  formatNoteDate,
} from '../src/shared/noteUtils';
import type { StickyNote } from '../src/shared/types';

describe('collectTagColors', () => {
  it('maps each tag to the color of the first note that carries it', () => {
    const notes = [
      makeNote({ id: '1', color: '#FFF59D', tags: ['챗지피티'] }),
      makeNote({ id: '2', color: '#C8E6C9', tags: ['메모장'] }),
      makeNote({ id: '3', color: '#B3E5FC', tags: ['챗지피티'] }),
    ];
    expect(collectTagColors(notes)).toEqual({ 챗지피티: '#FFF59D', 메모장: '#C8E6C9' });
  });
});

describe('addTag', () => {
  it('appends a stripped, trimmed tag', () => {
    expect(addTag([], '  #foo  ')).toEqual(['foo']);
  });

  it('ignores an empty tag', () => {
    expect(addTag(['foo'], '   ')).toEqual(['foo']);
  });

  it('does not add a case-insensitive duplicate', () => {
    expect(addTag(['foo'], 'FOO')).toEqual(['foo']);
  });
});

describe('formatNoteDate', () => {
  it('shows date and time for a note created today', () => {
    const now = new Date(2026, 7, 13, 15, 4).getTime();
    const createdAt = new Date(2026, 7, 13, 9, 5).getTime();
    expect(formatNoteDate(createdAt, now)).toBe('2026.08.13 09:05');
  });

  it('shows only the date once the note is no longer from today', () => {
    const now = new Date(2026, 7, 13, 0, 30).getTime();
    const createdAt = new Date(2026, 7, 12, 23, 59).getTime();
    expect(formatNoteDate(createdAt, now)).toBe('2026.08.12');
  });
});

function makeNote(overrides: Partial<StickyNote>): StickyNote {
  return {
    id: '1',
    content: '',
    color: '#FFF59D',
    tags: [],
    position: { x: 0, y: 0 },
    size: { width: 240, height: 240 },
    fontSize: 18,
    alwaysOnTop: true,
    isOpen: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('filterNotes', () => {
  const notes = [
    makeNote({ id: '1', content: 'API 키 저장', tags: ['API키'] }),
    makeNote({ id: '2', content: '장보기 목록', tags: ['깃허브'] }),
  ];

  it('returns all notes for an empty query', () => {
    expect(filterNotes(notes, '')).toEqual(notes);
  });

  it('matches by tag substring, case-insensitively', () => {
    expect(filterNotes(notes, 'api').map((n) => n.id)).toEqual(['1']);
  });

  it('matches by content substring', () => {
    expect(filterNotes(notes, '장보기').map((n) => n.id)).toEqual(['2']);
  });
});

describe('collectAllTags', () => {
  it('returns sorted, de-duplicated tags across notes', () => {
    const notes = [makeNote({ tags: ['b', 'a'] }), makeNote({ tags: ['a', 'c'] })];
    expect(collectAllTags(notes)).toEqual(['a', 'b', 'c']);
  });

  it('de-dupes tags case-insensitively, keeping the first-seen casing', () => {
    const notes = [makeNote({ tags: ['Work'] }), makeNote({ tags: ['work', 'WORK'] })];
    expect(collectAllTags(notes)).toEqual(['Work']);
  });
});
