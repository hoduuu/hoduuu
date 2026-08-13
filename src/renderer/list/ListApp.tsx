import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AppSettings, StickyNote } from '../../shared/types';
import { filterNotes, collectAllTags, collectTagColors } from '../../shared/noteUtils';
import { getDarkColor } from '../../shared/noteColors';
import { FONT_SIZE_OPTIONS } from '../../shared/fonts';
import { NoteCard } from './NoteCard';
import './ListApp.css';

const DEFAULT_SETTINGS: AppSettings = { listFontSize: 18, listAlwaysOnTop: false };
const GEAR_TOOTH_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

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

  function handleListFontSizeChange(listFontSize: number) {
    window.notesAPI.updateSettings({ listFontSize });
  }

  function handleListAlwaysOnTopToggle() {
    window.notesAPI.updateSettings({ listAlwaysOnTop: !settings.listAlwaysOnTop });
  }

  const listStyle = { '--list-font-size': `${settings.listFontSize}px` } as CSSProperties;

  return (
    <div className="list-app" style={listStyle}>
      <div className="list-app__titlebar">
        <button
          className={`list-app__pin ${settings.listAlwaysOnTop ? 'active' : ''}`}
          onClick={handleListAlwaysOnTopToggle}
          title="항상 위에 고정"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M14.5 2.5 21.5 9.5 19 12l-2-.5-4 4 .5 5-1.5 1.5-4-4L3 22l4-4-4-4 1.5-1.5 5 .5 4-4-.5-2Z"
              fill={settings.listAlwaysOnTop ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="list-app__titlebar-drag" />
        <div className="list-app__settings-widget" ref={settingsWidgetRef}>
          <button
            className="list-app__settings-toggle"
            onClick={() => setSettingsPopoverOpen((open) => !open)}
            aria-expanded={settingsPopoverOpen}
            title="글씨 크기"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
              {GEAR_TOOTH_ANGLES.map((deg) => (
                <rect
                  key={deg}
                  x="10.8"
                  y="1.6"
                  width="2.4"
                  height="3"
                  rx="0.5"
                  fill="currentColor"
                  transform={`rotate(${deg} 12 12)`}
                />
              ))}
            </svg>
          </button>
          {settingsPopoverOpen && (
            <div className="list-app__settings-popover">
              {FONT_SIZE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`list-app__settings-option ${settings.listFontSize === option.value ? 'active' : ''}`}
                  onClick={() => handleListFontSizeChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          className="list-app__titlebar-close"
          onClick={() => window.close()}
          aria-label="창 닫기"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M5 5 19 19M19 5 5 19"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
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
          placeholder="검색"
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
