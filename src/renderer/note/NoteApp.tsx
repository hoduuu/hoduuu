import { useEffect, useRef, useState } from 'react';
import type { AppSettings, StickyNote } from '../../shared/types';
import { addTag } from '../../shared/noteUtils';
import { debounce } from '../../shared/debounce';
import { NOTE_COLORS, getDarkColor } from '../../shared/noteColors';
import './NoteApp.css';

const COLORS = NOTE_COLORS.map((c) => c.light);
const DEFAULT_SETTINGS: AppSettings = { fontFamily: 'sans-serif', fontSize: 14 };

export function NoteApp() {
  const noteId = window.noteId;
  const [note, setNote] = useState<StickyNote | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [tagDraft, setTagDraft] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveContent = useRef(
    debounce((id: string, content: string) => {
      window.notesAPI.update(id, { content });
    }, 500),
  );

  useEffect(() => {
    return window.notesAPI.onSaveError(setSaveError);
  }, []);

  useEffect(() => {
    window.notesAPI.getSettings().then(setSettings);
    return window.notesAPI.onSettingsChanged(setSettings);
  }, []);

  useEffect(() => {
    if (!noteId) return;
    window.notesAPI.getAll().then((notes) => {
      const found = notes.find((n) => n.id === noteId) ?? null;
      setNote(found);
    });
    return window.notesAPI.onNotesChanged((notes) => {
      const found = notes.find((n) => n.id === noteId) ?? null;
      // Content is only ever edited via this window's own textarea (debounce-saved), so a
      // broadcast echo of our own save (or a stale one racing a newer keystroke) must never
      // overwrite local content — otherwise just-typed characters can be silently dropped.
      // Every other field (color, tags, alwaysOnTop, ...) is authoritative from the broadcast.
      if (found) setNote((prev) => (prev ? { ...found, content: prev.content } : found));
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

  function handleAddTag() {
    const tags = addTag(note!.tags, tagDraft);
    setTagDraft('');
    if (tags === note!.tags) return;
    setNote((prev) => (prev ? { ...prev, tags } : prev));
    window.notesAPI.update(note!.id, { tags });
  }

  function handleRemoveTag(tag: string) {
    const tags = note!.tags.filter((t) => t !== tag);
    setNote((prev) => (prev ? { ...prev, tags } : prev));
    window.notesAPI.update(note!.id, { tags });
  }

  function handleAlwaysOnTopToggle() {
    const alwaysOnTop = !note!.alwaysOnTop;
    setNote((prev) => (prev ? { ...prev, alwaysOnTop } : prev));
    window.notesAPI.update(note!.id, { alwaysOnTop });
  }

  const tagTextColor = getDarkColor(note.color);

  return (
    <div className="note-app" style={{ backgroundColor: note.color }}>
      {saveError && (
        <div className="note-app__error-banner">
          {saveError}
          <button onClick={() => setSaveError(null)}>닫기</button>
        </div>
      )}
      <div className="note-app__toolbar">
        <div className="note-app__toolbar-group">
          {COLORS.map((color) => (
            <button
              key={color}
              className={`note-app__swatch ${note.color === color ? 'active' : ''}`}
              style={{ backgroundColor: color }}
              onClick={() => handleColorChange(color)}
            />
          ))}
        </div>
        <div className="note-app__toolbar-actions">
          <button
            className="note-app__menu"
            onClick={() => window.notesAPI.openListWindow()}
            title="목록 보기"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                d="M4 6h16M4 12h16M4 18h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            className={`note-app__pin ${note.alwaysOnTop ? 'active' : ''}`}
            onClick={handleAlwaysOnTopToggle}
            title="항상 위에 고정"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                d="M14.5 2.5 21.5 9.5 19 12l-2-.5-4 4 .5 5-1.5 1.5-4-4L3 22l4-4-4-4 1.5-1.5 5 .5 4-4-.5-2Z"
                fill={note.alwaysOnTop ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            className="note-app__close"
            onClick={() => window.notesAPI.closeCurrentWindow()}
            title="닫기"
          >
            ×
          </button>
        </div>
      </div>
      <textarea
        className="note-app__content"
        style={{ fontFamily: settings.fontFamily, fontSize: settings.fontSize }}
        value={note.content}
        onChange={(event) => handleContentChange(event.target.value)}
      />
      <div className="note-app__tags">
        {note.tags.map((tag) => (
          <span key={tag} className="note-app__tag-pill" style={{ color: tagTextColor }}>
            #{tag}
            <button onClick={() => handleRemoveTag(tag)} aria-label={`${tag} 태그 삭제`}>
              ×
            </button>
          </span>
        ))}
        <div className="note-app__tag-input">
          <input
            placeholder="태그 입력"
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleAddTag();
              }
            }}
          />
          <button onClick={handleAddTag} aria-label="태그 추가">
            +
          </button>
        </div>
      </div>
    </div>
  );
}
