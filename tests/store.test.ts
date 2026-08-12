import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createNoteStore } from '../src/main/store';

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
});
