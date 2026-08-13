import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, StickyNote } from '../../shared/types';
import { filterNotes, collectAllTags, collectTagColors } from '../../shared/noteUtils';
import { getDarkColor } from '../../shared/noteColors';
import { FONT_FAMILIES, FONT_SIZES } from '../../shared/fonts';
import { NoteCard } from './NoteCard';
import './ListApp.css';

const DEFAULT_SETTINGS: AppSettings = { fontFamily: 'sans-serif', fontSize: 14 };

export function ListApp() {
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsPopoverOpen, setSettingsPopoverOpen] = useState(false);
  const settingsWidgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.notesAPI.getAll().then(setNotes);
    return window.notesAPI.onNotesChanged(setNotes);
  }, []);

  useEffect(() => {
    return window.notesAPI.onSaveError(setSaveError);
  }, []);

  useEffect(() => {
    window.notesAPI.getSettings().then(setSettings);
    return window.notesAPI.onSettingsChanged(setSettings);
  }, []);

  useEffect(() => {
    if (!settingsPopoverOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!settingsWidgetRef.current?.contains(event.target as Node)) {
        setSettingsPopoverOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSettingsPopoverOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [settingsPopoverOpen]);

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => b.createdAt - a.createdAt),
    [notes],
  );

  const visibleNotes = useMemo(() => {
    const searched = filterNotes(sortedNotes, query);
    return activeTag ? searched.filter((note) => note.tags.includes(activeTag)) : searched;
  }, [sortedNotes, query, activeTag]);

  // collectAllTags/collectTagColors는 생성 순서(notes, 정렬 전)를 기준으로 "처음 등장한 노트의
  // 색"을 태그 색으로 고정하므로, 화면 정렬용 sortedNotes가 아니라 원본 notes를 넘긴다.
  const allTags = useMemo(() => collectAllTags(notes), [notes]);
  const tagColors = useMemo(() => collectTagColors(notes), [notes]);

  async function handleCreate() {
    const note = await window.notesAPI.create({});
    if (note) await window.notesAPI.openNoteWindow(note.id);
  }

  async function handleDelete(id: string) {
    await window.notesAPI.remove(id);
  }

  function handleFontFamilyChange(fontFamily: string) {
    window.notesAPI.updateSettings({ fontFamily });
  }

  function handleFontSizeChange(fontSize: number) {
    window.notesAPI.updateSettings({ fontSize });
  }

  return (
    <div className="list-app">
      <div className="list-app__titlebar">
        <div className="list-app__titlebar-drag" />
        <div className="list-app__settings-widget" ref={settingsWidgetRef}>
          <button
            className="list-app__settings-toggle"
            onClick={() => setSettingsPopoverOpen((open) => !open)}
            aria-expanded={settingsPopoverOpen}
            title="글씨체/크기 설정"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path
                d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.4 3.5a7.97 7.97 0 0 0-.15-1.5l2.02-1.58-2-3.46-2.38.96a8.05 8.05 0 0 0-2.6-1.5L14.9 2h-4l-.39 2.42a8.05 8.05 0 0 0-2.6 1.5l-2.38-.96-2 3.46 2.02 1.58a7.97 7.97 0 0 0 0 3l-2.02 1.58 2 3.46 2.38-.96c.77.66 1.65 1.17 2.6 1.5L10.9 22h4l.39-2.42a8.05 8.05 0 0 0 2.6-1.5l2.38.96 2-3.46-2.02-1.58c.1-.49.15-.99.15-1.5Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {settingsPopoverOpen && (
            <div className="list-app__settings-popover">
              <div className="list-app__settings-section">
                <span className="list-app__settings-label">글씨체</span>
                {FONT_FAMILIES.map((font) => (
                  <button
                    key={font.value}
                    className={`list-app__settings-option ${settings.fontFamily === font.value ? 'active' : ''}`}
                    onClick={() => handleFontFamilyChange(font.value)}
                  >
                    {font.label}
                  </button>
                ))}
              </div>
              <div className="list-app__settings-section">
                <span className="list-app__settings-label">크기</span>
                {FONT_SIZES.map((size) => (
                  <button
                    key={size}
                    className={`list-app__settings-option ${settings.fontSize === size ? 'active' : ''}`}
                    onClick={() => handleFontSizeChange(size)}
                  >
                    {size}px
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button
          className="list-app__titlebar-close"
          onClick={() => window.close()}
          aria-label="창 닫기"
        >
          ×
        </button>
      </div>

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
        {allTags.map((tag) => {
          const color = tagColors[tag.toLowerCase()];
          const isActive = activeTag === tag;
          return (
            <button
              key={tag}
              className={isActive ? 'active' : ''}
              style={{
                backgroundColor: isActive ? getDarkColor(color) : color,
                color: isActive ? '#fff' : 'inherit',
              }}
              onClick={() => setActiveTag(tag === activeTag ? null : tag)}
            >
              #{tag}
            </button>
          );
        })}
      </div>

      <ul className="list-app__notes">
        {visibleNotes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            tagColors={tagColors}
            onOpen={() => window.notesAPI.openNoteWindow(note.id)}
            onDelete={() => handleDelete(note.id)}
          />
        ))}
      </ul>
    </div>
  );
}
