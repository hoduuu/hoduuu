import Store from 'electron-store';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppSettings, StickyNote } from '../shared/types';
import { FONT_FAMILIES, FONT_SIZES } from '../shared/fonts';

interface NotesSchema {
  notes: StickyNote[];
  settings: AppSettings;
}

const DEFAULT_SIZE = { width: 240, height: 240 };
const DEFAULT_COLOR = '#FFF59D';
const DEFAULT_FONT_FAMILY = 'sans-serif';
const DEFAULT_FONT_SIZE = 14;

export function createNoteStore(cwd: string) {
  const filePath = path.join(cwd, 'notes.json');
  backupIfCorrupted(filePath);

  const store = new Store<NotesSchema>({
    name: 'notes',
    cwd,
    defaults: {
      notes: [],
      settings: { fontFamily: DEFAULT_FONT_FAMILY, fontSize: DEFAULT_FONT_SIZE },
    },
  });

  function getAllNotes(): StickyNote[] {
    return store.get('notes');
  }

  function getSettings(): AppSettings {
    return store.get('settings');
  }

  function updateSettings(changes: Partial<AppSettings>): AppSettings {
    // The renderer's payload is untrusted (a corrupted or malicious IPC message could send
    // anything), so only accept values that are actually valid options; silently drop
    // anything else rather than persisting/reloading garbage on every future launch.
    const validated: Partial<AppSettings> = {};
    if (
      changes.fontFamily !== undefined &&
      FONT_FAMILIES.some((f) => f.value === changes.fontFamily)
    ) {
      validated.fontFamily = changes.fontFamily;
    }
    if (changes.fontSize !== undefined && (FONT_SIZES as number[]).includes(changes.fontSize)) {
      validated.fontSize = changes.fontSize;
    }
    const updated = { ...getSettings(), ...validated };
    store.set('settings', updated);
    return updated;
  }

  function createNote(partial: Partial<StickyNote> = {}): StickyNote {
    const now = Date.now();
    const note: StickyNote = {
      id: randomUUID(),
      content: partial.content ?? '',
      color: partial.color ?? DEFAULT_COLOR,
      tags: partial.tags ?? [],
      position: partial.position ?? { x: 100, y: 100 },
      size: partial.size ?? { ...DEFAULT_SIZE },
      alwaysOnTop: partial.alwaysOnTop ?? true,
      isOpen: partial.isOpen ?? true,
      createdAt: now,
      updatedAt: now,
    };
    store.set('notes', [...getAllNotes(), note]);
    return note;
  }

  function updateNote(id: string, changes: Partial<StickyNote>): StickyNote | null {
    const notes = getAllNotes();
    const index = notes.findIndex((n) => n.id === id);
    if (index === -1) return null;
    const updated: StickyNote = { ...notes[index], ...changes, id, updatedAt: Date.now() };
    const next = [...notes];
    next[index] = updated;
    store.set('notes', next);
    return updated;
  }

  function deleteNote(id: string): boolean {
    const notes = getAllNotes();
    const next = notes.filter((n) => n.id !== id);
    if (next.length === notes.length) return false;
    store.set('notes', next);
    return true;
  }

  return { getAllNotes, createNote, updateNote, deleteNote, getSettings, updateSettings };
}

function backupIfCorrupted(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  try {
    JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    const backupPath = `${filePath}.bak`;
    // Never overwrite an existing backup: if corruption happens twice, the first backup is
    // the user's only remaining recovery copy of their data, so a second corruption must not
    // clobber it with the (also corrupted) second version.
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(filePath, backupPath);
    }
    fs.rmSync(filePath);
  }
}

export type NoteStore = ReturnType<typeof createNoteStore>;
