import { useEffect, useMemo, useState } from 'react';
import type { StickyNote } from '../../shared/types';
import {
  filterNotes,
  collectAllTags,
  collectTagColors,
  formatNoteDate,
} from '../../shared/noteUtils';
import './ListApp.css';

export function ListApp() {
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    window.notesAPI.getAll().then(setNotes);
    return window.notesAPI.onNotesChanged(setNotes);
  }, []);

  useEffect(() => {
    return window.notesAPI.onSaveError(setSaveError);
  }, []);

  const visibleNotes = useMemo(() => {
    const searched = filterNotes(notes, query);
    return activeTag ? searched.filter((note) => note.tags.includes(activeTag)) : searched;
  }, [notes, query, activeTag]);

  const allTags = useMemo(() => collectAllTags(notes), [notes]);
  const tagColors = useMemo(() => collectTagColors(notes), [notes]);

  async function handleCreate() {
    const note = await window.notesAPI.create({});
    if (note) await window.notesAPI.openNoteWindow(note.id);
  }

  async function handleDelete(id: string) {
    await window.notesAPI.remove(id);
  }

  return (
    <div className="list-app">
      {saveError && (
        <div className="list-app__error-banner">
          {saveError}
          <button onClick={() => setSaveError(null)}>닫기</button>
        </div>
      )}
      <header className="list-app__header">
        <input
          className="list-app__search"
          placeholder="검색 (텍스트 또는 #태그)"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="list-app__new" onClick={handleCreate} aria-label="새 메모">
          +
        </button>
      </header>

      <div className="list-app__tags">
        <button className={activeTag === null ? 'active' : ''} onClick={() => setActiveTag(null)}>
          전체
        </button>
        {allTags.map((tag) => (
          <button
            key={tag}
            className={activeTag === tag ? 'active' : ''}
            style={{ backgroundColor: tagColors[tag.toLowerCase()] }}
            onClick={() => setActiveTag(tag === activeTag ? null : tag)}
          >
            #{tag}
          </button>
        ))}
      </div>

      <ul className="list-app__notes">
        {visibleNotes.map((note) => (
          <li key={note.id} className="list-app__note" style={{ backgroundColor: note.color }}>
            <div className="list-app__note-header">
              <span className="list-app__note-date">{formatNoteDate(note.createdAt)}</span>
              <button
                className="list-app__note-delete"
                onClick={() => handleDelete(note.id)}
                aria-label="메모 삭제"
              >
                ×
              </button>
            </div>
            <button
              className="list-app__note-open"
              onClick={() => window.notesAPI.openNoteWindow(note.id)}
            >
              <span className="list-app__note-content">{note.content || '(빈 메모)'}</span>
              <span className="list-app__note-tags">
                {note.tags.map((tag) => (
                  <span
                    key={tag}
                    className="list-app__note-tag"
                    style={{ backgroundColor: note.color }}
                  >
                    #{tag}
                  </span>
                ))}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
