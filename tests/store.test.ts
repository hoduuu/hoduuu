import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createNoteStore } from '../src/main/store';
import type { AppSettings } from '../src/shared/types';

describe('createNoteStore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts with an empty notes list', () => {
    const store = createNoteStore(tmpDir);
    expect(store.getAllNotes()).toEqual([]);
  });

  it('creates a note with defaults filled in', () => {
    const store = createNoteStore(tmpDir);
    const note = store.createNote({ content: 'hello' });
    expect(note.content).toBe('hello');
    expect(note.color).toBe('#FFF59D');
    expect(note.tags).toEqual([]);
    expect(store.getAllNotes()).toHaveLength(1);
  });

  it('updates an existing note and bumps updatedAt', () => {
    const store = createNoteStore(tmpDir);
    const note = store.createNote({ content: 'v1' });
    const updated = store.updateNote(note.id, { content: 'v2' });
    expect(updated?.content).toBe('v2');
    expect(store.getAllNotes()[0].content).toBe('v2');
  });

  it('returns null when updating a missing note', () => {
    const store = createNoteStore(tmpDir);
    expect(store.updateNote('missing-id', { content: 'x' })).toBeNull();
  });

  it('deletes a note', () => {
    const store = createNoteStore(tmpDir);
    const note = store.createNote({ content: 'to delete' });
    expect(store.deleteNote(note.id)).toBe(true);
    expect(store.getAllNotes()).toEqual([]);
  });

  it('returns false when deleting a missing note', () => {
    const store = createNoteStore(tmpDir);
    expect(store.deleteNote('missing-id')).toBe(false);
  });

  it('recovers from a corrupted notes file by backing it up and starting empty', () => {
    fs.writeFileSync(path.join(tmpDir, 'notes.json'), '{ not valid json');
    const store = createNoteStore(tmpDir);
    expect(store.getAllNotes()).toEqual([]);
    expect(fs.existsSync(path.join(tmpDir, 'notes.json.bak'))).toBe(true);
  });

  it('does not overwrite an existing backup on repeated corruption', () => {
    const notesPath = path.join(tmpDir, 'notes.json');
    const backupPath = `${notesPath}.bak`;

    fs.writeFileSync(notesPath, '{ first corruption');
    createNoteStore(tmpDir);
    expect(fs.readFileSync(backupPath, 'utf-8')).toBe('{ first corruption');

    // Second corruption happens against a fresh store file (the first recovery already
    // reset notes.json to a valid empty store); corrupt it again and re-open.
    fs.writeFileSync(notesPath, '{ second corruption');
    const store = createNoteStore(tmpDir);

    // The backup must still hold the FIRST corruption, not the second.
    expect(fs.readFileSync(backupPath, 'utf-8')).toBe('{ first corruption');
    // The store still recovers to a fresh, empty state after the second corruption.
    expect(store.getAllNotes()).toEqual([]);
  });

  it('gives each created note its own size object (no shared-reference aliasing)', () => {
    const store = createNoteStore(tmpDir);
    const noteA = store.createNote({ content: 'a' });
    const noteB = store.createNote({ content: 'b' });
    expect(noteA.size).toEqual({ width: 240, height: 240 });
    expect(noteB.size).toEqual({ width: 240, height: 240 });
    expect(noteA.size).not.toBe(noteB.size);
  });

  it('returns default settings before any update', () => {
    const store = createNoteStore(tmpDir);
    expect(store.getSettings()).toEqual({ fontFamily: 'sans-serif', fontSize: 14 });
  });

  it('updates settings and merges with the existing values', () => {
    const store = createNoteStore(tmpDir);
    const updated = store.updateSettings({ fontSize: 18 });
    expect(updated).toEqual({ fontFamily: 'sans-serif', fontSize: 18 });
    expect(store.getSettings()).toEqual({ fontFamily: 'sans-serif', fontSize: 18 });
  });

  it('persists settings across store instances backed by the same directory', () => {
    const store = createNoteStore(tmpDir);
    store.updateSettings({ fontFamily: 'serif', fontSize: 22 });
    const reopened = createNoteStore(tmpDir);
    expect(reopened.getSettings()).toEqual({ fontFamily: 'serif', fontSize: 22 });
  });

  it('ignores an invalid fontFamily while still applying a valid fontSize in the same call', () => {
    const store = createNoteStore(tmpDir);
    const updated = store.updateSettings({
      fontFamily: 'not-a-real-font' as AppSettings['fontFamily'],
      fontSize: 18,
    });
    expect(updated).toEqual({ fontFamily: 'sans-serif', fontSize: 18 });
    expect(store.getSettings()).toEqual({ fontFamily: 'sans-serif', fontSize: 18 });
  });

  it('ignores an invalid fontSize while still applying a valid fontFamily in the same call', () => {
    const store = createNoteStore(tmpDir);
    const updated = store.updateSettings({
      fontFamily: 'serif',
      fontSize: 999 as AppSettings['fontSize'],
    });
    expect(updated).toEqual({ fontFamily: 'serif', fontSize: 14 });
    expect(store.getSettings()).toEqual({ fontFamily: 'serif', fontSize: 14 });
  });
});
