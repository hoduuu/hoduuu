# 노트/리스트 창 UI 6차 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 리스트 창에 압정(항상 위 고정) 기능을 추가하고, 검색창/태그 필터 글자 크기를 리스트 글씨 크기 설정에서 분리하며, 톱니바퀴·×아이콘을 대칭적인 SVG로 다시 그리고, 노트 창 색상 스와치 선택 테두리를 없애고, 기본 글꼴을 돋움으로 지정한다.

**Architecture:** 기존 Electron main/renderer 구조를 그대로 따른다. `AppSettings`에 `listAlwaysOnTop`을 추가해 리스트 창 자신의 "항상 위 고정" 상태를 저장하고, 노트 창의 `setNoteAlwaysOnTop`과 동일한 패턴으로 main 프로세스가 실제 `BrowserWindow`에 반영한다.

**Tech Stack:** Electron, React 18, TypeScript, electron-store 8.x, Vitest (기존 스택 그대로, 신규 의존성 없음)

## Global Constraints

- 참조 스펙: `docs/superpowers/specs/2026-08-13-icons-listpin-fonts-design.md`
- 아이콘 버튼 크기(28px)는 이번에 바꾸지 않는다 — 실제로 22px과 28px을 렌더링해 비교한 뒤 28px 유지로 확정됐다. 대신 ×를 텍스트 글자에서 SVG로 바꿔 ⚙과 시각적 크기를 맞춘다.
- 톱니바퀴 아이콘은 손으로 그린 비대칭 path 대신, 원 + 8개의 회전된 사각형 톱니로 코드 상에서 대칭이 보장되는 형태로 다시 그린다.
- 검색창 글자 크기(18px)와 태그 필터 글자 크기(15px)는 고정값이며 리스트 창 ⚙(글씨 크기 설정)의 영향을 받지 않는다. ⚙는 리스트 카드 본문(`.list-app__note-content`)에만 계속 영향을 준다.
- 기본 글꼴은 `'Dotum', '돋움', sans-serif`다.
- 이 저장소는 두 개의 독립된 TypeScript 프로젝트로 나뉜다: `tsconfig.node.json`(main+preload+shared)과 `tsconfig.json`(renderer+shared+tests). `npm run typecheck`는 이 둘을 순서대로 실행하므로, `AppSettings`에 새 필드를 추가하는 Task 1만으로는 전체 typecheck가 실패할 수 있다(리스트 창의 `DEFAULT_SETTINGS` 객체 리터럴이 아직 새 필드를 안 넣었기 때문) — Task 3에서 고쳐진다. 각 태스크는 자신이 맡은 범위의 통과 기준을 따로 명시한다.
- 자동화 테스트(Vitest)는 순수 로직(`store.ts`의 CRUD/설정)에 한정한다. 창 생성/프레임/드래그/리사이즈 같은 OS 레벨 동작과 React UI는 수동(Xvfb+CDP 또는 `npm run dev` + devtools)으로 검증한다.

---

## File Structure

```
src/
  shared/
    types.ts     - AppSettings에 listAlwaysOnTop 추가
  main/
    store.ts     - listAlwaysOnTop 기본값/검증 추가
    windows.ts   - createListWindow가 초기 alwaysOnTop을 받도록, setListAlwaysOnTop 추가
    ipc.ts       - UPDATE_SETTINGS가 listAlwaysOnTop 변경 시 실제 창에도 반영
    index.ts     - createListWindow 호출 3곳 + setListAlwaysOnTop 콜백 배선
  renderer/
    note/
      NoteApp.tsx  - 스와치 active 클래스 제거, 톱니바퀴/× SVG 교체
      NoteApp.css  - 스와치 active 테두리 규칙 삭제, 돋움 폰트, close 텍스트 스타일 제거
    list/
      ListApp.tsx  - 압정 버튼 추가, 톱니바퀴/× SVG 교체, 검색 placeholder 단순화
      ListApp.css  - 압정 스타일, 타이틀바 패딩 축소, 검색/태그 글자 크기 고정,
                     +버튼 flex-shrink, 돋움 폰트
tests/
  store.test.ts  - 설정 관련 테스트에 listAlwaysOnTop 반영
```

---

### Task 1: 데이터 모델 + Main 프로세스 — 리스트 창 압정 (TDD)

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/store.ts`
- Modify: `src/main/windows.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`
- Modify: `tests/store.test.ts`

**Interfaces:**
- Consumes: 없음(공용 기반 변경)
- Produces: `AppSettings { listFontSize: number; listAlwaysOnTop: boolean }`,
  `NoteStore.updateSettings`가 `listAlwaysOnTop`도 검증,
  `createListWindow(initialAlwaysOnTop: boolean): BrowserWindow`,
  `setListAlwaysOnTop(value: boolean): void`(windows.ts에서 export) — Task 3이 렌더러에서 사용

이 태스크만으로는 **전체** `npm run typecheck`가 실패할 수 있다 — `src/renderer/list/ListApp.tsx`의
`DEFAULT_SETTINGS` 객체 리터럴이 아직 `listAlwaysOnTop`을 넣지 않았기 때문이다(Task 3에서
고쳐진다). 이 태스크의 통과 기준은 `npx tsc --noEmit -p tsconfig.node.json`(main/preload/shared만
검사)과 `npm test`다.

- [ ] **Step 1: `src/shared/types.ts`에서 `AppSettings`에 필드 추가**

`AppSettings` 인터페이스를 다음으로 바꾼다(다른 타입/상수는 그대로 둔다):

```typescript
export interface AppSettings {
  listFontSize: number;
  listAlwaysOnTop: boolean;
}
```

- [ ] **Step 2: `tests/store.test.ts`의 설정 관련 테스트를 새 필드에 맞게 갱신 + 추가 (실패하는 테스트 작성)**

기존 4개의 `it('...settings...')`/`it('...listFontSize...')` 테스트 블록을 아래 내용으로
통째로 바꾸고, 새 테스트 2개를 추가한다(파일의 다른 부분은 그대로 둔다):

```typescript
  it('returns default settings before any update', () => {
    const store = createNoteStore(tmpDir);
    expect(store.getSettings()).toEqual({ listFontSize: 18, listAlwaysOnTop: false });
  });

  it('updates settings and merges with the existing values', () => {
    const store = createNoteStore(tmpDir);
    const updated = store.updateSettings({ listFontSize: 21 });
    expect(updated).toEqual({ listFontSize: 21, listAlwaysOnTop: false });
    expect(store.getSettings()).toEqual({ listFontSize: 21, listAlwaysOnTop: false });
  });

  it('persists settings across store instances backed by the same directory', () => {
    const store = createNoteStore(tmpDir);
    store.updateSettings({ listFontSize: 15 });
    const reopened = createNoteStore(tmpDir);
    expect(reopened.getSettings()).toEqual({ listFontSize: 15, listAlwaysOnTop: false });
  });

  it('ignores an invalid listFontSize and keeps the previous value', () => {
    const store = createNoteStore(tmpDir);
    const updated = store.updateSettings({ listFontSize: 999 });
    expect(updated).toEqual({ listFontSize: 18, listAlwaysOnTop: false });
    expect(store.getSettings()).toEqual({ listFontSize: 18, listAlwaysOnTop: false });
  });

  it('updates listAlwaysOnTop independently of listFontSize', () => {
    const store = createNoteStore(tmpDir);
    const updated = store.updateSettings({ listAlwaysOnTop: true });
    expect(updated).toEqual({ listFontSize: 18, listAlwaysOnTop: true });
    expect(store.getSettings()).toEqual({ listFontSize: 18, listAlwaysOnTop: true });
  });

  it('ignores a non-boolean listAlwaysOnTop value', () => {
    const store = createNoteStore(tmpDir);
    const updated = store.updateSettings({ listAlwaysOnTop: 'yes' as unknown as boolean });
    expect(updated).toEqual({ listFontSize: 18, listAlwaysOnTop: false });
    expect(store.getSettings()).toEqual({ listFontSize: 18, listAlwaysOnTop: false });
  });
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test -- store`
Expected: FAIL — `store.ts`가 아직 `listAlwaysOnTop`을 모르므로 `getSettings()`/`updateSettings()`
결과에 그 필드가 없어 `toEqual`이 어긋난다.

- [ ] **Step 4: `src/main/store.ts` 전체 교체**

```typescript
import Store from 'electron-store';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppSettings, StickyNote } from '../shared/types';
import { FONT_SIZES } from '../shared/fonts';

interface NotesSchema {
  notes: StickyNote[];
  settings: AppSettings;
}

const DEFAULT_SIZE = { width: 300, height: 240 };
const DEFAULT_COLOR = '#FFF59D';
const DEFAULT_FONT_SIZE = 18;
const DEFAULT_LIST_ALWAYS_ON_TOP = false;

export function createNoteStore(cwd: string) {
  const filePath = path.join(cwd, 'notes.json');
  backupIfCorrupted(filePath);

  const store = new Store<NotesSchema>({
    name: 'notes',
    cwd,
    defaults: {
      notes: [],
      settings: { listFontSize: DEFAULT_FONT_SIZE, listAlwaysOnTop: DEFAULT_LIST_ALWAYS_ON_TOP },
    },
  });

  function getAllNotes(): StickyNote[] {
    return store.get('notes');
  }

  function getSettings(): AppSettings {
    return store.get('settings');
  }

  function updateSettings(changes: Partial<AppSettings>): AppSettings {
    // The renderer's payload is untrusted, so only accept a value that is actually a valid
    // option; silently drop anything else rather than persisting/reloading garbage.
    const validated: Partial<AppSettings> = {};
    if (
      changes.listFontSize !== undefined &&
      (FONT_SIZES as number[]).includes(changes.listFontSize)
    ) {
      validated.listFontSize = changes.listFontSize;
    }
    if (typeof changes.listAlwaysOnTop === 'boolean') {
      validated.listAlwaysOnTop = changes.listAlwaysOnTop;
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
      fontSize: partial.fontSize ?? DEFAULT_FONT_SIZE,
      alwaysOnTop: partial.alwaysOnTop ?? false,
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
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- store`
Expected: PASS (17개 테스트 모두 통과)

- [ ] **Step 6: `src/main/windows.ts`에서 `createListWindow`가 초기 always-on-top을 받도록 수정하고
  `setListAlwaysOnTop`을 추가**

`createListWindow` 함수 전체를 다음으로 바꾼다:

```typescript
export function createListWindow(initialAlwaysOnTop: boolean): BrowserWindow {
  if (listWindow) {
    listWindow.show();
    listWindow.focus();
    return listWindow;
  }
  listWindow = new BrowserWindow({
    width: 360,
    height: 600,
    minWidth: 240,
    minHeight: 300,
    alwaysOnTop: initialAlwaysOnTop,
    frame: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js') },
  });
  loadRendererPage(listWindow, 'list');
  listWindow.on('closed', () => {
    listWindow = null;
  });
  return listWindow;
}
```

`setNoteAlwaysOnTop` 함수 바로 아래에 새 함수를 추가한다:

```typescript
export function setListAlwaysOnTop(value: boolean): void {
  listWindow?.setAlwaysOnTop(value);
}
```

나머지(`openNoteWindow`, `restoreOpenNoteWindows`, 트레이/PNG 헬퍼 등)는 전혀 건드리지 않는다.

- [ ] **Step 7: `src/main/ipc.ts`에서 설정 변경 시 리스트 창에도 반영**

`WindowCallbacks` 인터페이스에 한 줄을 추가한다:

```typescript
interface WindowCallbacks {
  openNoteWindow: (id: string) => void;
  openListWindow: () => void;
  setNoteAlwaysOnTop: (id: string, value: boolean) => void;
  setListAlwaysOnTop: (value: boolean) => void;
  closeNoteWindow: (id: string) => void;
}
```

`UPDATE_SETTINGS` 핸들러를 다음으로 바꾼다:

```typescript
  ipcMain.handle(IPC_CHANNELS.UPDATE_SETTINGS, (event, changes: Partial<AppSettings>) =>
    withSaveErrorHandling(event, () => {
      const updated = store.updateSettings(changes);
      if (changes.listAlwaysOnTop !== undefined) {
        callbacks.setListAlwaysOnTop(updated.listAlwaysOnTop);
      }
      broadcastSettingsChanged(updated);
      return updated;
    }),
  );
```

- [ ] **Step 8: `src/main/index.ts` 전체 교체**

```typescript
import { app, BrowserWindow } from 'electron';
import { createNoteStore } from './store';
import { registerIpcHandlers } from './ipc';
import {
  createListWindow,
  openNoteWindow,
  restoreOpenNoteWindows,
  setNoteAlwaysOnTop,
  setListAlwaysOnTop,
  closeNoteWindow,
  createTray,
} from './windows';

app.whenReady().then(() => {
  const store = createNoteStore(app.getPath('userData'));

  registerIpcHandlers(store, {
    openNoteWindow: (id) => openNoteWindow(store, id),
    openListWindow: () => {
      createListWindow(store.getSettings().listAlwaysOnTop);
    },
    setNoteAlwaysOnTop,
    setListAlwaysOnTop,
    closeNoteWindow: (id) => closeNoteWindow(id),
  });

  createTray(() => createListWindow(store.getSettings().listAlwaysOnTop));
  createListWindow(store.getSettings().listAlwaysOnTop);
  restoreOpenNoteWindows(store);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createListWindow(store.getSettings().listAlwaysOnTop);
    }
  });
});

app.on('window-all-closed', () => {
  // 트레이에 상주해야 하므로 창이 모두 닫혀도 앱을 종료하지 않는다.
  // 종료는 트레이 메뉴의 "종료"를 통해서만 이루어진다.
});
```

- [ ] **Step 9: main 프로세스 타입 확인**

Run: `npx tsc --noEmit -p tsconfig.node.json`
Expected: PASS

- [ ] **Step 10: 커밋**

```bash
git add src/shared/types.ts src/main/store.ts src/main/windows.ts src/main/ipc.ts src/main/index.ts tests/store.test.ts
git commit -m "$(cat <<'EOF'
데이터 모델: 리스트 창 자체의 항상 위 고정(listAlwaysOnTop) 추가
EOF
)"
```

---

### Task 2: 노트 창 UI — 스와치 테두리 제거, 아이콘 정리, 돋움 글꼴

**Files:**
- Modify: `src/renderer/note/NoteApp.tsx`
- Modify: `src/renderer/note/NoteApp.css`

**Interfaces:**
- Consumes: 없음(Task 1과 무관 — 이 파일은 `AppSettings`를 전혀 참조하지 않는다)
- Produces: 갱신된 `NoteApp` 컴포넌트 (외부에 새로 노출하는 것 없음)

이 태스크는 순수 UI 변경이라 새 Vitest 대상 로직은 없다. `npx tsc --noEmit -p tsconfig.json`을
실행했을 때 `NoteApp.tsx` 관련 에러가 없으면 된다(Task 1이 아직 안 끝났거나 Task 3이 아직 시작 전
이라면 `ListApp.tsx` 쪽 에러가 남아있을 수 있는데, 그건 이 태스크 책임이 아니다).

- [ ] **Step 1: `src/renderer/note/NoteApp.tsx` 전체 교체**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { StickyNote } from '../../shared/types';
import { addTag } from '../../shared/noteUtils';
import { debounce } from '../../shared/debounce';
import { NOTE_COLORS, getDarkColor } from '../../shared/noteColors';
import { FONT_SIZE_OPTIONS } from '../../shared/fonts';
import './NoteApp.css';

const COLORS = NOTE_COLORS.map((c) => c.light);
const GEAR_TOOTH_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export function NoteApp() {
  const noteId = window.noteId;
  const [note, setNote] = useState<StickyNote | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sizePopoverOpen, setSizePopoverOpen] = useState(false);
  const sizeWidgetRef = useRef<HTMLDivElement>(null);
  const saveContent = useRef(
    debounce((id: string, content: string) => {
      window.notesAPI.update(id, { content });
    }, 500),
  );

  useEffect(() => {
    return window.notesAPI.onSaveError(setSaveError);
  }, []);

  useEffect(() => {
    if (!sizePopoverOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!sizeWidgetRef.current?.contains(event.target as Node)) setSizePopoverOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSizePopoverOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [sizePopoverOpen]);

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
      // Every other field (color, tags, fontSize, alwaysOnTop, ...) is authoritative from
      // the broadcast.
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
          <button
            className={`note-app__pin ${note.alwaysOnTop ? 'active' : ''}`}
            onClick={handleAlwaysOnTopToggle}
            title="항상 위에 고정"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M14.5 2.5 21.5 9.5 19 12l-2-.5-4 4 .5 5-1.5 1.5-4-4L3 22l4-4-4-4 1.5-1.5 5 .5 4-4-.5-2Z"
                fill={note.alwaysOnTop ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {COLORS.map((color) => (
            <button
              key={color}
              className="note-app__swatch"
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
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M4 6h16M4 12h16M4 18h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div className="note-app__size-widget" ref={sizeWidgetRef}>
            <button
              className="note-app__size-toggle"
              onClick={() => setSizePopoverOpen((open) => !open)}
              aria-expanded={sizePopoverOpen}
              title="글씨 크기"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
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
            {sizePopoverOpen && (
              <div className="note-app__size-popover">
                {FONT_SIZE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`note-app__size-option ${note.fontSize === option.value ? 'active' : ''}`}
                    onClick={() => handleFontSizeChange(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className="note-app__close"
            onClick={async () => {
              // Flush the debounced content save synchronously before closing: main decides
              // whether to delete an empty-content note on close, so the store must reflect
              // the latest keystrokes before that check runs (see deleteNoteIfEmpty).
              await window.notesAPI.update(note!.id, { content: note!.content });
              await window.notesAPI.closeCurrentWindow();
            }}
            title="닫기"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M5 5 19 19M19 5 5 19"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
      <textarea
        className="note-app__content"
        style={{ fontSize: note.fontSize }}
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
            placeholder="#태그"
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
```

- [ ] **Step 2: `src/renderer/note/NoteApp.css` 전체 교체**

```css
html, body { margin: 0; padding: 0; height: 100%; }
#root { height: 100%; }

.note-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  box-sizing: border-box;
  font-family: 'Dotum', '돋움', sans-serif;
  overflow: hidden;
}
.note-app--loading { padding: 8px; }

.note-app__toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 4px;
  padding: 10px 12px;
  -webkit-app-region: drag;
}
.note-app__toolbar-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
}
.note-app__swatch {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.18);
  padding: 0;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.note-app__toolbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.note-app__menu {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(0, 0, 0, 0.55);
  cursor: pointer;
  flex-shrink: 0;
}
.note-app__menu:hover { background: rgba(0, 0, 0, 0.08); }

.note-app__pin {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(0, 0, 0, 0.55);
  cursor: pointer;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}
.note-app__pin:hover { background: rgba(0, 0, 0, 0.08); }
.note-app__pin.active { color: #d84315; background: rgba(255, 255, 255, 0.55); }

.note-app__size-widget { position: relative; }
.note-app__size-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(0, 0, 0, 0.55);
  cursor: pointer;
}
.note-app__size-toggle:hover { background: rgba(0, 0, 0, 0.08); }

.note-app__size-popover {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 5;
  display: flex;
  gap: 4px;
  background: #fff;
  border-radius: 999px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  padding: 4px;
}
.note-app__size-option {
  border: none;
  background: transparent;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  color: #333;
  cursor: pointer;
  white-space: nowrap;
}
.note-app__size-option:hover { background: rgba(0, 0, 0, 0.06); }
.note-app__size-option.active { background: rgba(0, 0, 0, 0.08); font-weight: 700; }

.note-app__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(0, 0, 0, 0.55);
  cursor: pointer;
  flex-shrink: 0;
}
.note-app__close:hover { background: rgba(0, 0, 0, 0.08); }

.note-app__content {
  flex: 1;
  resize: none;
  border: none;
  background: transparent;
  font-family: inherit;
  padding: 0 8px;
  box-sizing: border-box;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  overflow-x: hidden;
  overflow-y: auto;
}
.note-app__content:focus { outline: none; }
.note-app__content::-webkit-scrollbar { width: 6px; }
.note-app__content::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
.note-app__content::-webkit-scrollbar-track { background: transparent; }
.note-app__content::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.25); border-radius: 999px; }
.note-app__content::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.4); }

.note-app__tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
}
.note-app__tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(255, 255, 255, 0.65);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 13px;
}
.note-app__tag-pill button {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  color: inherit;
}
.note-app__tag-input {
  display: inline-flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 999px;
  padding: 2px 4px 2px 8px;
  gap: 4px;
}
.note-app__tag-input input {
  border: none;
  background: transparent;
  font-size: 13px;
  width: 80px;
  outline: none;
}
.note-app__tag-input button {
  border: none;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  line-height: 1;
  background: rgba(255, 255, 255, 0.8);
  cursor: pointer;
}

.list-app__error-banner,
.note-app__error-banner {
  background: #ffebee;
  color: #c62828;
  padding: 6px 8px;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}
```

- [ ] **Step 3: 타입 확인**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: `NoteApp.tsx`/`NoteApp.css` 관련 에러 없음(다른 파일의 기존 에러는 이 태스크 책임 밖).

- [ ] **Step 4: 수동 검증**

Run: `npm run dev` (또는 Xvfb + CDP)

1. 색상 스와치를 클릭해 색을 바꿔봐도, 선택된 스와치에 회색 테두리가 안 생기는지 확인.
2. 톱니바퀴 아이콘이 대칭으로(찌그러지지 않고) 보이는지, × 아이콘이 SVG로 바뀌어 ⚙과 비슷한
   굵기/크기로 보이는지 확인.
3. 본문 텍스트가 돋움 계열 글꼴로 렌더링되는지 확인(시스템에 돋움이 없으면 sans-serif로
   자연히 대체된다).
4. ☰/⚙/×, 압정 클릭이 여전히 정상 동작하는지(회귀 없음) 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/renderer/note/NoteApp.tsx src/renderer/note/NoteApp.css
git commit -m "$(cat <<'EOF'
노트 창: 스와치 선택 테두리 제거, 대칭 톱니바퀴/× SVG로 교체,
기본 글꼴을 돋움으로 지정
EOF
)"
```

---

### Task 3: 리스트 창 UI — 압정 추가, 검색/태그 글자 크기 고정, 아이콘 정리

**Files:**
- Modify: `src/renderer/list/ListApp.tsx`
- Modify: `src/renderer/list/ListApp.css`

**Interfaces:**
- Consumes: `AppSettings.listAlwaysOnTop`(Task 1), `FONT_SIZE_OPTIONS`(기존 `src/shared/fonts.ts`,
  변경 없음)
- Produces: 갱신된 `ListApp` 컴포넌트

이 태스크가 끝나면 전체 `npm run typecheck`가 다시 통과해야 한다 — `ListApp.tsx`의
`DEFAULT_SETTINGS`가 Task 1에서 넓어진 `AppSettings` 타입을 완전히 채우는 마지막 소비자다.

- [ ] **Step 1: `src/renderer/list/ListApp.tsx` 전체 교체**

```tsx
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
```

- [ ] **Step 2: `src/renderer/list/ListApp.css` 전체 교체**

```css
html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
#root { height: 100%; }

.list-app { display: flex; flex-direction: column; height: 100vh; font-family: 'Dotum', '돋움', sans-serif; }

.list-app__titlebar {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  flex-shrink: 0;
  -webkit-app-region: drag;
}
.list-app__titlebar-drag { flex: 1; height: 100%; }

.list-app__pin {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(0, 0, 0, 0.55);
  cursor: pointer;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}
.list-app__pin:hover { background: rgba(0, 0, 0, 0.08); }
.list-app__pin.active { color: #d84315; background: rgba(255, 255, 255, 0.55); }

.list-app__settings-widget { position: relative; -webkit-app-region: no-drag; }
.list-app__settings-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(0, 0, 0, 0.55);
  cursor: pointer;
}
.list-app__settings-toggle:hover { background: rgba(0, 0, 0, 0.08); }

.list-app__settings-popover {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 5;
  display: flex;
  gap: 4px;
  background: #fff;
  border-radius: 999px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  padding: 4px;
}
.list-app__settings-option {
  border: none;
  background: transparent;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  color: #333;
  cursor: pointer;
  white-space: nowrap;
}
.list-app__settings-option:hover { background: rgba(0, 0, 0, 0.06); }
.list-app__settings-option.active { background: rgba(0, 0, 0, 0.08); font-weight: 700; }

.list-app__titlebar-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(0, 0, 0, 0.55);
  cursor: pointer;
  -webkit-app-region: no-drag;
}
.list-app__titlebar-close:hover { background: rgba(0, 0, 0, 0.08); }

.list-app__header { display: flex; align-items: center; gap: 8px; padding: 8px; }
.list-app__search {
  flex: 1;
  border: none;
  background: #eee;
  border-radius: 4px;
  padding: 6px 8px;
  box-sizing: border-box;
  font: inherit;
  font-size: 18px;
}
.list-app__search:focus { outline: 2px solid rgba(0, 0, 0, 0.15); }

.list-app__new {
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  color: rgba(0, 0, 0, 0.65);
  flex-shrink: 0;
}
.list-app__new:hover { background: rgba(0, 0, 0, 0.08); color: rgba(0, 0, 0, 0.85); }

.list-app__tags { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 8px 8px; }
.list-app__tags button {
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 15px;
  background: #eee;
  cursor: pointer;
  transition: filter 0.1s ease;
}
.list-app__tags button:hover { filter: brightness(0.93); }
.list-app__tags button.active { font-weight: bold; border-color: transparent; }

.list-app__notes {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.list-app__notes::-webkit-scrollbar { width: 6px; }
.list-app__notes::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
.list-app__notes::-webkit-scrollbar-track { background: transparent; }
.list-app__notes::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.25); border-radius: 999px; }
.list-app__notes::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.4); }

.list-app__note {
  display: flex;
  flex-direction: column;
  border-radius: 6px;
  margin: 6px 8px;
  overflow: hidden;
  transition: filter 0.1s ease;
}
.list-app__note:hover { filter: brightness(0.93); }

.list-app__note-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  padding: 4px 6px 0;
}
.list-app__note-date { font-size: 10px; color: rgba(0, 0, 0, 0.55); }

.list-app__note-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(0, 0, 0, 0.5);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}
.list-app__note-delete:hover { background: rgba(0, 0, 0, 0.12); color: rgba(0, 0, 0, 0.8); }

.list-app__note-open {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  width: 100%;
  border: none;
  background: transparent;
  padding: 4px 8px 8px;
  box-sizing: border-box;
  cursor: pointer;
  font: inherit;
  color: inherit;
}

.list-app__note-content {
  font-size: var(--list-font-size, 14px);
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
}

.list-app__note-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.list-app__note-tag {
  font-size: 11px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 999px;
  padding: 3px 10px;
}
.list-app__note-tag-more {
  font-size: 11px;
  border-radius: 999px;
  padding: 3px 10px;
  background: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.6);
  cursor: pointer;
}

.list-app__error-banner,
.note-app__error-banner {
  background: #ffebee;
  color: #c62828;
  padding: 6px 8px;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}
```

- [ ] **Step 3: 전체 타입 확인**

Run: `npm run typecheck`
Expected: PASS (main/preload/shared, renderer/shared/tests 두 프로젝트 모두 통과 — 이 시점부터
전체 타입 에러가 없어야 한다)

- [ ] **Step 4: 수동 검증**

Run: `npm run dev` (또는 Xvfb + CDP)

1. 타이틀바 맨 왼쪽에 압정이 보이는지, 클릭하면 리스트 창이 실제로 항상 위에 고정되는지(다른
   창 뒤로 안 숨는지), 다시 클릭하면 풀리는지 확인.
2. 앱을 재시작해도 압정 상태가 유지되는지 확인.
3. 타이틀바 첫 줄이 이전보다 좁아 보이는지 확인.
4. 검색창이 "검색" placeholder로 보이고 글자 크기가 18px로 고정인지, ⚙에서 크기를 바꿔도
   검색창/태그 필터 글자 크기가 그대로인지, 카드 본문 글자 크기만 바뀌는지 확인.
5. 창을 좁게 줄여도 "+"버튼이 잘리거나 사라지지 않는지 확인.
6. 톱니바퀴가 대칭으로 보이고, × 아이콘이 SVG로 바뀌어 ⚙과 비슷한 크기/굵기로 보이는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/renderer/list/ListApp.tsx src/renderer/list/ListApp.css
git commit -m "$(cat <<'EOF'
리스트 창: 압정(항상 위 고정) 추가, 검색/태그 글자 크기 고정,
대칭 톱니바퀴/× SVG로 교체, 돋움 글꼴
EOF
)"
```

---

### Task 4: 통합 수동 검증 & 최종 회귀 확인

**Files:** 없음(코드 변경 없음, 검증만)

**Interfaces:** 없음

Task 1~3의 개별 변경이 서로 부딪히지 않는지 통합적으로 확인하고, 전체 회귀를 최종 점검한다.

- [ ] **Step 1: 전체 자동화 테스트/빌드 확인**

Run: `npm run typecheck && npm test && npm run build`
Expected: 셋 다 PASS.

- [ ] **Step 2: 리스트 창 압정과 노트 창 압정이 서로 독립적인지 확인**

Run: `npm run dev` (또는 Xvfb + CDP)

1. 리스트 창 압정을 켜고, 노트 창을 하나 연다 — 노트 창의 압정은 여전히 꺼진 기본 상태인지
   확인(리스트 압정을 켰다고 노트 압정까지 켜지면 안 된다).
2. 노트 창 압정을 켜고 리스트 창의 압정 상태는 그대로인지 확인(반대 방향도 서로 영향 없어야
   한다).

- [ ] **Step 3: 아이콘/글꼴 전체 훑어보기**

1. 노트 창과 리스트 창을 나란히 띄워 놓고 톱니바퀴 두 개(노트 20px, 리스트 18px)와 × 두 개가
   서로 비슷한 스타일로 보이는지 확인.
2. 두 창 모두 기본 글꼴이 통일되게 보이는지 확인.
3. 노트 창 색상 스와치를 여러 번 바꿔보며 테두리가 전혀 안 나타나는지 확인.

- [ ] **Step 4: 발견된 문제가 없으면 완료 기록**

이 태스크는 코드 변경이 없으므로 커밋할 것이 없다. 검증 중 문제를 발견하면 해당 태스크로
돌아가 수정한다.
