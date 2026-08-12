import { useEffect, useRef, useState } from 'react';
import type { StickyNote } from '../../shared/types';
import { normalizeTagInput } from '../../shared/noteUtils';
import { debounce } from '../../shared/debounce';
import './NoteApp.css';

const COLORS = ['#FFF59D', '#FFCCBC', '#C8E6C9', '#B3E5FC', '#E1BEE7'];

export function NoteApp() {
  const noteId = window.noteId;
  const [note, setNote] = useState<StickyNote | null>(null);
  const [tagInput, setTagInput] = useState('');
  const saveContent = useRef(
    debounce((id: string, content: string) => {
      window.notesAPI.update(id, { content });
    }, 500),
  );

  useEffect(() => {
    if (!noteId) return;
    window.notesAPI.getAll().then((notes) => {
      const found = notes.find((n) => n.id === noteId) ?? null;
      setNote(found);
      setTagInput(found ? found.tags.map((t) => `#${t}`).join(' ') : '');
    });
    return window.notesAPI.onNotesChanged((notes) => {
      const found = notes.find((n) => n.id === noteId) ?? null;
      if (found) setNote(found);
    });
  }, [noteId]);

  if (!note) return <div className="note-app note-app--loading">불러오는 중...</div>;

  function handleContentChange(value: string) {
    setNote((prev) => (prev ? { ...prev, content: value } : prev));
    saveContent.current(note!.id, value);
  }

  function handleColorChange(color: string) {
    setNote((prev) => (prev ? { ...prev, color } : prev));
    window.notesAPI.update(note!.id, { color });
  }

  function handleTagInputBlur() {
    const tags = normalizeTagInput(tagInput);
    setNote((prev) => (prev ? { ...prev, tags } : prev));
    window.notesAPI.update(note!.id, { tags });
  }

  function handleAlwaysOnTopToggle() {
    const alwaysOnTop = !note!.alwaysOnTop;
    setNote((prev) => (prev ? { ...prev, alwaysOnTop } : prev));
    window.notesAPI.update(note!.id, { alwaysOnTop });
  }

  return (
    <div className="note-app" style={{ backgroundColor: note.color }}>
      <div className="note-app__toolbar">
        {COLORS.map((color) => (
          <button
            key={color}
            className="note-app__swatch"
            style={{ backgroundColor: color }}
            onClick={() => handleColorChange(color)}
          />
        ))}
        <button
          className={`note-app__pin ${note.alwaysOnTop ? 'active' : ''}`}
          onClick={handleAlwaysOnTopToggle}
        >
          📌
        </button>
      </div>
      <textarea
        className="note-app__content"
        value={note.content}
        onChange={(event) => handleContentChange(event.target.value)}
      />
      <input
        className="note-app__tags"
        placeholder="#태그 입력"
        value={tagInput}
        onChange={(event) => setTagInput(event.target.value)}
        onBlur={handleTagInputBlur}
      />
    </div>
  );
}
