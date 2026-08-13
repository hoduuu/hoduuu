import { describe, it, expect } from 'vitest';
import { normalizeTagInput, filterNotes, collectAllTags } from '../src/shared/noteUtils';
import type { StickyNote } from '../src/shared/types';

describe('normalizeTagInput', () => {
  it('strips leading # and trims whitespace', () => {
    expect(normalizeTagInput('#API키, #깃허브')).toEqual(['API키', '깃허브']);
  });

  it('splits on whitespace when no commas are present', () => {
    expect(normalizeTagInput('#foo #bar')).toEqual(['foo', 'bar']);
  });

  it('drops empty entries and de-dupes', () => {
    expect(normalizeTagInput('#foo, , #foo')).toEqual(['foo']);
  });

  it('de-dupes case-insensitively, keeping the first-seen casing', () => {
    expect(normalizeTagInput('#Work, #work')).toEqual(['Work']);
    expect(normalizeTagInput('#work, #Work, #WORK')).toEqual(['work']);
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
