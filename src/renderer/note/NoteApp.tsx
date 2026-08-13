import { useEffect, useRef, useState } from 'react';
import type { StickyNote } from '../../shared/types';
import { addTag } from '../../shared/noteUtils';
import { debounce } from '../../shared/debounce';
import './NoteApp.css';

const COLORS = ['#FFF59D', '#FFCCBC', '#C8E6C9', '#B3E5FC', '#E1BEE7'];
const FONT_FAMILIES = [
  { label: '기본', value: 'sans-serif' },
  { label: '명조', value: 'serif' },
  { label: '고정폭', value: 'monospace' },
  { label: '손글씨', value: 'cursive' },
];
const FONT_SIZES = [12, 14, 16, 18, 22];

export function NoteApp() {
  const noteId = window.noteId;
  const [note, setNote] = useState<StickyNote | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fontPopoverOpen, setFontPopoverOpen] = useState(false);
  const fontWidgetRef = useRef<HTMLDivElement>(null);
  const saveContent = useRef(
    debounce((id: string, content: string) => {
      window.notesAPI.update(id, { content });
    }, 500),
  );

  useEffect(() => {
    return window.notesAPI.onSaveError(setSaveError);
  }, []);

  useEffect(() => {
    if (!fontPopoverOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!fontWidgetRef.current?.contains(event.target as Node)) setFontPopoverOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setFontPopoverOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [fontPopoverOpen]);

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

  function handleFontFamilyChange(fontFamily: string) {
    setNote((prev) => (prev ? { ...prev, fontFamily } : prev));
    window.notesAPI.update(note!.id, { fontFamily });
  }

  function handleFontSizeChange(fontSize: number) {
    setNote((prev) => (prev ? { ...prev, fontSize } : prev));
    window.notesAPI.update(note!.id, { fontSize });
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
          <div className="note-app__font-widget" ref={fontWidgetRef}>
            <button
              className="note-app__font-toggle"
              onClick={() => setFontPopoverOpen((open) => !open)}
              aria-expanded={fontPopoverOpen}
              title="글씨체/크기"
            >
              Aa
            </button>
            {fontPopoverOpen && (
              <div className="note-app__font-popover">
                <div className="note-app__font-popover-section">
                  <span className="note-app__font-popover-label">글씨체</span>
                  {FONT_FAMILIES.map((font) => (
                    <button
                      key={font.value}
                      className={`note-app__font-option ${note.fontFamily === font.value ? 'active' : ''}`}
                      onClick={() => handleFontFamilyChange(font.value)}
                    >
                      {font.label}
                    </button>
                  ))}
                </div>
                <div className="note-app__font-popover-section">
                  <span className="note-app__font-popover-label">크기</span>
                  {FONT_SIZES.map((size) => (
                    <button
                      key={size}
                      className={`note-app__font-option ${note.fontSize === size ? 'active' : ''}`}
                      onClick={() => handleFontSizeChange(size)}
                    >
                      {size}px
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
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
      </div>
      <textarea
        className="note-app__content"
        style={{ fontFamily: note.fontFamily, fontSize: note.fontSize }}
        value={note.content}
        onChange={(event) => handleContentChange(event.target.value)}
      />
      <div className="note-app__tags">
        {note.tags.map((tag) => (
          <span key={tag} className="note-app__tag-pill">
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
