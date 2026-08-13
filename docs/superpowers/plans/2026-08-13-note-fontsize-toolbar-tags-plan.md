# 노트/리스트 창 UI 5차 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 폰트 크기를 메모별 설정으로 되돌리고(글씨체는 완전히 제거), 노트 창 툴바를 키우고 압정 위치/기본값을 바꾸며, 태그·빈 메모 처리·리스트 카드 표시를 다듬는다.

**Architecture:** 기존 Electron main/renderer 구조를 그대로 따른다. `StickyNote`에 `fontSize`를 다시 추가하고, `AppSettings`는 `listFontSize` 하나만 남겨 "리스트 창 자체의 표시 크기"라는 의미로 재정의한다. 두 값은 완전히 독립적이며, 노트 본문 폰트는 항상 그 노트 자신의 `fontSize`를 쓴다.

**Tech Stack:** Electron, React 18, TypeScript, electron-store 8.x, Vitest (기존 스택 그대로, 신규 의존성 없음)

## Global Constraints

- 참조 스펙: `docs/superpowers/specs/2026-08-13-note-fontsize-toolbar-tags-design.md`
- 글씨 크기 값은 `15 | 18 | 21`(작게/중간/크게) 세 단계만 존재한다. 글씨체(폰트 패밀리) 선택 기능은 완전히 제거한다.
- 노트 본문의 글자 크기는 항상 그 메모 자신의 `fontSize`를 쓴다. 리스트 창의 `listFontSize`는 리스트 화면(검색창·카드 내용) 표시에만 쓰이고 메모 본문에는 영향을 주지 않는다.
- 새 메모의 기본 `alwaysOnTop`은 `false`다(기존 `true`에서 변경).
- 노트 창을 본문이 빈 채로 닫으면(× 클릭) 그 메모를 삭제한다 — 이전까지의 "닫으면 숨기고 데이터는 지우지 않는다" 원칙의 명시적 예외이며, 본문이 비어 있지 않으면 기존 동작(숨김 + `isOpen:false`)이 그대로 적용된다.
- 자동화 테스트(Vitest)는 순수 로직(`store.ts`의 CRUD/설정)에 한정한다. 창 생성/프레임/드래그/리사이즈 같은 OS 레벨 동작과 React UI는 수동(Xvfb+CDP 또는 `npm run dev` + devtools)으로 검증한다.
- 이 저장소는 두 개의 독립된 TypeScript 프로젝트로 나뉜다: `tsconfig.node.json`(main + preload + shared)과 `tsconfig.json`(renderer + shared + tests). `npm run typecheck`는 이 둘을 순서대로 실행하므로, 렌더러 쪽 마이그레이션이 아직 안 끝난 태스크 도중에는 전체 `npm run typecheck`가 실패할 수 있다 — 각 태스크는 자신이 맡은 범위의 통과 기준을 따로 명시한다.

---

## File Structure

```
src/
  shared/
    types.ts     - StickyNote(fontSize 재추가), AppSettings(listFontSize로 축소)
    fonts.ts     - FONT_SIZE_OPTIONS(라벨+값), FONT_SIZES(값 배열). FONT_FAMILIES 삭제
  main/
    store.ts     - DEFAULT_FONT_SIZE=18, createNote가 fontSize/alwaysOnTop(false) 기본값 적용,
                   updateSettings가 listFontSize만 검증
    windows.ts   - 노트 창 close 핸들러에 "본문 비어있으면 삭제" 로직 추가
    ipc.ts       - broadcastChanged를 export(windows.ts가 재사용)
  renderer/
    note/
      NoteApp.tsx  - 압정을 좌측 맨 앞으로 이동, ⚙(글씨 크기 팝오버) 추가, 전역 설정 구독 제거,
                     본문은 note.fontSize 사용, 태그 placeholder "#태그"
      NoteApp.css  - 툴바 패딩/아이콘 크기 확대, 크기 팝오버 스타일
    list/
      ListApp.tsx  - 타이틀바 버튼 확대, ⚙ 팝오버를 글씨 크기 3단계로 축소, listFontSize를
                     CSS 변수로 전달
      ListApp.css  - 타이틀바/버튼 크기, --list-font-size 변수 사용, 필터 태그 호버 반응
      NoteCard.tsx - MAX_VISIBLE_TAGS 3→7, "더보기" 배지를 "..."로, 카드 태그에 테두리 추가
tests/
  store.test.ts     - 설정/기본값 테스트를 listFontSize·fontSize·alwaysOnTop 기준으로 갱신
  noteUtils.test.ts - makeNote 헬퍼에 fontSize 추가
```

---

### Task 1: 데이터 모델 + Main 프로세스 (TDD)

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/fonts.ts`
- Modify: `src/main/store.ts`
- Modify: `src/main/windows.ts`
- Modify: `src/main/ipc.ts`
- Modify: `tests/store.test.ts`
- Modify: `tests/noteUtils.test.ts`

**Interfaces:**
- Consumes: 없음(공용 기반 변경)
- Produces: `StickyNote.fontSize: number`, `AppSettings { listFontSize: number }`,
  `FONT_SIZE_OPTIONS: {label:string; value:number}[]`, `FONT_SIZES: number[]`,
  `NoteStore.createNote`가 `fontSize`/`alwaysOnTop:false` 기본값 적용,
  `NoteStore.updateSettings`가 `listFontSize`만 검증,
  `broadcastChanged(store: NoteStore): void`(ipc.ts에서 export) — Task 2, 3이 사용

이 태스크만으로는 **전체** `npm run typecheck`가 실패한다 — `src/renderer/note/NoteApp.tsx`와
`src/renderer/list/ListApp.tsx`가 아직 옛 `AppSettings` 모양(`fontFamily`/`fontSize`)을
참조하기 때문이다(Task 2, 3에서 고쳐진다). 이 태스크의 통과 기준은 `npx tsc --noEmit -p
tsconfig.node.json`(main/preload/shared만 검사)과 `npm test`다.

- [ ] **Step 1: `src/shared/types.ts` 전체 교체**

```typescript
export interface StickyNote {
  id: string;
  content: string;
  color: string;
  tags: string[];
  position: { x: number; y: number };
  size: { width: number; height: number };
  fontSize: number;
  alwaysOnTop: boolean;
  isOpen: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  listFontSize: number;
}

export interface NotesAPI {
  getAll: () => Promise<StickyNote[]>;
  create: (partial?: Partial<StickyNote>) => Promise<StickyNote | null>;
  update: (id: string, changes: Partial<StickyNote>) => Promise<StickyNote | null>;
  remove: (id: string) => Promise<boolean | null>;
  openNoteWindow: (id: string) => Promise<void>;
  openListWindow: () => Promise<void>;
  closeCurrentWindow: () => Promise<void>;
  getSettings: () => Promise<AppSettings>;
  updateSettings: (changes: Partial<AppSettings>) => Promise<AppSettings | null>;
  onNotesChanged: (callback: (notes: StickyNote[]) => void) => () => void;
  onSaveError: (callback: (message: string) => void) => () => void;
  onSettingsChanged: (callback: (settings: AppSettings) => void) => () => void;
}

export const IPC_CHANNELS = {
  GET_ALL: 'notes:getAll',
  CREATE: 'notes:create',
  UPDATE: 'notes:update',
  DELETE: 'notes:delete',
  OPEN_WINDOW: 'notes:openWindow',
  OPEN_LIST: 'notes:openList',
  CLOSE_WINDOW: 'notes:closeWindow',
  CHANGED: 'notes:changed',
  SAVE_ERROR: 'notes:saveError',
  GET_SETTINGS: 'settings:get',
  UPDATE_SETTINGS: 'settings:update',
  SETTINGS_CHANGED: 'settings:changed',
} as const;

declare global {
  interface Window {
    notesAPI: NotesAPI;
    noteId: string | null;
  }
}
```

- [ ] **Step 2: `src/shared/fonts.ts` 전체 교체**

```typescript
export const FONT_SIZE_OPTIONS = [
  { label: '작게', value: 15 },
  { label: '중간', value: 18 },
  { label: '크게', value: 21 },
];

export const FONT_SIZES = FONT_SIZE_OPTIONS.map((option) => option.value);
```

- [ ] **Step 3: `tests/store.test.ts` 전체 교체 (실패하는/갱신된 테스트 작성)**

```typescript
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
    expect(note.fontSize).toBe(18);
    expect(note.alwaysOnTop).toBe(false);
    expect(store.getAllNotes()).toHaveLength(1);
  });

  it('creates a note with an explicit fontSize override', () => {
    const store = createNoteStore(tmpDir);
    const note = store.createNote({ content: 'big', fontSize: 21 });
    expect(note.fontSize).toBe(21);
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

    fs.writeFileSync(notesPath, '{ second corruption');
    const store = createNoteStore(tmpDir);

    expect(fs.readFileSync(backupPath, 'utf-8')).toBe('{ first corruption');
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
    expect(store.getSettings()).toEqual({ listFontSize: 18 });
  });

  it('updates settings and merges with the existing values', () => {
    const store = createNoteStore(tmpDir);
    const updated = store.updateSettings({ listFontSize: 21 });
    expect(updated).toEqual({ listFontSize: 21 });
    expect(store.getSettings()).toEqual({ listFontSize: 21 });
  });

  it('persists settings across store instances backed by the same directory', () => {
    const store = createNoteStore(tmpDir);
    store.updateSettings({ listFontSize: 15 });
    const reopened = createNoteStore(tmpDir);
    expect(reopened.getSettings()).toEqual({ listFontSize: 15 });
  });

  it('ignores an invalid listFontSize and keeps the previous value', () => {
    const store = createNoteStore(tmpDir);
    const updated = store.updateSettings({ listFontSize: 999 });
    expect(updated).toEqual({ listFontSize: 18 });
    expect(store.getSettings()).toEqual({ listFontSize: 18 });
  });
});
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `npm test -- store`
Expected: FAIL — `store.ts`가 아직 옛 `fontFamily`/`fontSize` 스키마를 쓰고 있어 여러 `expect`가
어긋난다(`note.fontSize`가 `undefined`, `note.alwaysOnTop`이 `true`, `getSettings()`가
`{fontFamily, fontSize}` 모양 등).

- [ ] **Step 5: `src/main/store.ts` 전체 교체**

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

const DEFAULT_SIZE = { width: 240, height: 240 };
const DEFAULT_COLOR = '#FFF59D';
const DEFAULT_FONT_SIZE = 18;

export function createNoteStore(cwd: string) {
  const filePath = path.join(cwd, 'notes.json');
  backupIfCorrupted(filePath);

  const store = new Store<NotesSchema>({
    name: 'notes',
    cwd,
    defaults: {
      notes: [],
      settings: { listFontSize: DEFAULT_FONT_SIZE },
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

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm test -- store`
Expected: PASS (15개 테스트 모두 통과)

- [ ] **Step 7: `tests/noteUtils.test.ts`의 `makeNote` 헬퍼에 `fontSize` 추가**

`makeNote` 함수 안, `alwaysOnTop: true,` 줄 바로 위에 다음 줄을 추가한다:

```typescript
    fontSize: 18,
```

- [ ] **Step 8: 전체 단위 테스트 확인**

Run: `npm test`
Expected: PASS (모든 테스트 파일 통과 — `StickyNote`에 새 필드가 추가된 것 때문에 깨지는 다른
테스트 파일이 없는지 확인)

- [ ] **Step 9: `src/main/ipc.ts`에서 `broadcastChanged`를 export**

`function broadcastChanged(store: NoteStore): void {` 줄을
`export function broadcastChanged(store: NoteStore): void {`로 바꾼다. 함수 본문은 그대로 둔다.

- [ ] **Step 10: `src/main/windows.ts`에 빈 메모 자동 삭제 로직 추가**

파일 상단 import를 바꾼다:

```typescript
import { toReadableErrorMessage, broadcastChanged } from './ipc';
```

`openNoteWindow` 함수 안의 `win.on('close', (event) => { ... });` 블록 전체를 다음으로 바꾼다:

```typescript
  win.on('close', (event) => {
    if (isQuitting) return;
    if (deleteNoteIfEmpty(store, id)) return;
    event.preventDefault();
    win.hide();
    persistNoteUpdate(store, id, { isOpen: false });
  });
```

`persistNoteUpdate` 함수 바로 위(또는 아래)에 새 함수를 추가한다:

```typescript
// A note left completely empty when its window closes is almost always an accidental "new
// note" the user never actually wrote into — deleting it (instead of leaving an empty entry
// behind in the list forever) is the requested default. Only the note's own `content` is
// checked; tags alone don't save it from deletion.
function deleteNoteIfEmpty(store: NoteStore, id: string): boolean {
  const note = store.getAllNotes().find((n) => n.id === id);
  if (!note || note.content !== '') return false;
  try {
    store.deleteNote(id);
    broadcastChanged(store);
    return true;
  } catch (error) {
    const message = toReadableErrorMessage(error);
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC_CHANNELS.SAVE_ERROR, `저장 실패: ${message}`);
    }
    return false;
  }
}
```

나머지(`openNoteWindow`의 다른 부분, `createListWindow`, 트레이/PNG 헬퍼 등)는 전혀 건드리지
않는다.

- [ ] **Step 11: main 프로세스 타입 확인**

Run: `npx tsc --noEmit -p tsconfig.node.json`
Expected: PASS

(참고: 이 시점에 `npm run typecheck`를 전체로 실행하면 렌더러 쪽에서 실패한다 — Global
Constraints에서 설명한 대로 Task 2, 3에서 고쳐진다. 이 태스크에서는 렌더러 파일을 손대지
않는다.)

- [ ] **Step 12: 커밋**

```bash
git add src/shared/types.ts src/shared/fonts.ts src/main/store.ts src/main/windows.ts src/main/ipc.ts tests/store.test.ts tests/noteUtils.test.ts
git commit -m "$(cat <<'EOF'
데이터 모델: 메모별 fontSize 복원, 리스트 전용 listFontSize로 축소,
빈 메모 닫으면 자동 삭제
EOF
)"
```

---

### Task 2: 노트 창 UI — 툴바 확대, 압정 이동, 글씨 크기 팝오버

**Files:**
- Modify: `src/renderer/note/NoteApp.tsx`
- Modify: `src/renderer/note/NoteApp.css`

**Interfaces:**
- Consumes: `StickyNote.fontSize`, `FONT_SIZE_OPTIONS`(Task 1), `NOTE_COLORS`/`getDarkColor`(기존
  `src/shared/noteColors.ts`, 변경 없음)
- Produces: 갱신된 `NoteApp` 컴포넌트 (외부에 새로 노출하는 것 없음)

이 태스크는 순수 UI 변경이라 새 Vitest 대상 로직은 없다. 이 태스크가 끝나도 `ListApp.tsx`/
`NoteCard.tsx`가 아직 Task 3에서 바뀌지 않았으므로 전체 `npm run typecheck`는 여전히 실패할 수
있다 — `NoteApp.tsx` 관련 에러만 사라졌는지 확인하고, `ListApp.tsx`/`NoteCard.tsx` 관련 에러는
무시한다.

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
                <path
                  d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.4 3.5a7.97 7.97 0 0 0-.15-1.5l2.02-1.58-2-3.46-2.38.96a8.05 8.05 0 0 0-2.6-1.5L14.9 2h-4l-.39 2.42a8.05 8.05 0 0 0-2.6 1.5l-2.38-.96-2 3.46 2.02 1.58a7.97 7.97 0 0 0 0 3l-2.02 1.58 2 3.46 2.38-.96c.77.66 1.65 1.17 2.6 1.5L10.9 22h4l.39-2.42a8.05 8.05 0 0 0 2.6-1.5l2.38.96 2-3.46-2.02-1.58c.1-.49.15-.99.15-1.5Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
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
            onClick={() => window.notesAPI.closeCurrentWindow()}
            title="닫기"
          >
            ×
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
  font-family: sans-serif;
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
.note-app__swatch.active { outline: 2px solid rgba(0, 0, 0, 0.55); outline-offset: 2px; }

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
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
}
.note-app__close:hover { background: rgba(0, 0, 0, 0.08); }

.note-app__content {
  flex: 1;
  resize: none;
  border: none;
  background: transparent;
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

- [ ] **Step 3: 수동 검증**

Run: `npm run dev` (또는 Xvfb + CDP)

1. 노트 창 툴바가 이전보다 확실히 커 보이는지(패딩/아이콘) 확인.
2. 툴바 좌측 맨 앞에 압정이 있고, 그 뒤로 색상 5개가 오는지 확인.
3. 새 메모를 만들었을 때 압정이 기본적으로 꺼진(비활성) 상태인지 확인.
4. ⚙ 클릭 → "작게/중간/크게" 3개 버튼이 가로로 뜨고, 클릭하면 그 메모의 본문 글자 크기가
   즉시 바뀌는지, 팝오버가 바깥 클릭·Esc로 닫히는지 확인.
5. 다른 메모를 열어 크기를 다르게 설정한 뒤, 두 메모 창을 나란히 띄워 서로 다른 크기가
   유지되는지 확인(메모별로 독립적인지).
6. 태그 입력창의 placeholder가 "#태그"로 보이는지 확인.
7. 가장자리 드래그 리사이즈, 툴바 드래그 이동, ☰/×가 여전히 정상 동작하는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/renderer/note/NoteApp.tsx src/renderer/note/NoteApp.css
git commit -m "$(cat <<'EOF'
노트 창: 툴바 확대, 압정을 좌측 맨 앞으로 이동, 메모별 글씨 크기
팝오버 추가
EOF
)"
```

---

### Task 3: 리스트 창 UI — 타이틀바 확대, 글씨 크기 팝오버, 태그 스타일/더보기

**Files:**
- Modify: `src/renderer/list/ListApp.tsx`
- Modify: `src/renderer/list/ListApp.css`
- Modify: `src/renderer/list/NoteCard.tsx`

**Interfaces:**
- Consumes: `AppSettings.listFontSize`, `FONT_SIZE_OPTIONS`(Task 1), `getDarkColor`(기존
  `src/shared/noteColors.ts`, 변경 없음)
- Produces: 갱신된 `ListApp`/`NoteCard` 컴포넌트

이 태스크가 끝나면 전체 `npm run typecheck`가 다시 통과해야 한다(Task 1의 타입 변경과 Task 2의
`NoteApp.tsx` 변경이 이미 끝나 있고, 이 태스크가 마지막 남은 소비자인 `ListApp.tsx`/
`NoteCard.tsx`를 고치기 때문).

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

const DEFAULT_SETTINGS: AppSettings = { listFontSize: 18 };

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

  const listStyle = { '--list-font-size': `${settings.listFontSize}px` } as CSSProperties;

  return (
    <div className="list-app" style={listStyle}>
      <div className="list-app__titlebar">
        <div className="list-app__titlebar-drag" />
        <div className="list-app__settings-widget" ref={settingsWidgetRef}>
          <button
            className="list-app__settings-toggle"
            onClick={() => setSettingsPopoverOpen((open) => !open)}
            aria-expanded={settingsPopoverOpen}
            title="글씨 크기"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
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
```

- [ ] **Step 2: `src/renderer/list/ListApp.css` 전체 교체**

```css
html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
#root { height: 100%; }

.list-app { display: flex; flex-direction: column; height: 100vh; font-family: sans-serif; }

.list-app__titlebar {
  display: flex;
  align-items: center;
  padding: 8px 8px;
  flex-shrink: 0;
  -webkit-app-region: drag;
}
.list-app__titlebar-drag { flex: 1; height: 100%; }

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
  font-size: 18px;
  line-height: 1;
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
  font-size: var(--list-font-size, 14px);
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
}
.list-app__new:hover { background: rgba(0, 0, 0, 0.08); color: rgba(0, 0, 0, 0.85); }

.list-app__tags { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 8px 8px; }
.list-app__tags button {
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
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

- [ ] **Step 3: `src/renderer/list/NoteCard.tsx` 전체 교체**

```tsx
import { useState } from 'react';
import type { StickyNote } from '../../shared/types';
import { formatNoteDate } from '../../shared/noteUtils';
import { getDarkColor } from '../../shared/noteColors';

const MAX_VISIBLE_TAGS = 7;

interface NoteCardProps {
  note: StickyNote;
  tagColors: Record<string, string>;
  onOpen: () => void;
  onDelete: () => void;
}

export function NoteCard({ note, tagColors, onOpen, onDelete }: NoteCardProps) {
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const visibleTags = tagsExpanded ? note.tags : note.tags.slice(0, MAX_VISIBLE_TAGS);
  const hiddenCount = note.tags.length - MAX_VISIBLE_TAGS;

  return (
    <li className="list-app__note" style={{ backgroundColor: note.color }}>
      <div className="list-app__note-header">
        <span className="list-app__note-date">{formatNoteDate(note.createdAt)}</span>
        <button className="list-app__note-delete" onClick={onDelete} aria-label="메모 삭제">
          ×
        </button>
      </div>
      <button className="list-app__note-open" onClick={onOpen}>
        <span className="list-app__note-content">{note.content || '(빈 메모)'}</span>
        <span className="list-app__note-tags">
          {visibleTags.map((tag) => {
            const color = tagColors[tag.toLowerCase()] ?? note.color;
            return (
              <span
                key={tag}
                className="list-app__note-tag"
                style={{ backgroundColor: color, color: getDarkColor(color) }}
              >
                #{tag}
              </span>
            );
          })}
          {!tagsExpanded && hiddenCount > 0 && (
            <span
              className="list-app__note-tag-more"
              onClick={(event) => {
                event.stopPropagation();
                setTagsExpanded(true);
              }}
            >
              ...
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
```

- [ ] **Step 4: 전체 타입 확인**

Run: `npm run typecheck`
Expected: PASS (main/preload/shared, renderer/shared/tests 두 프로젝트 모두 통과 — 이 시점부터
전체 타입 에러가 없어야 한다)

- [ ] **Step 5: 수동 검증**

Run: `npm run dev` (또는 Xvfb + CDP)

1. 리스트 창 타이틀바(⚙+×)의 높이가 검색 헤더 행과 비슷해 보이는지 확인.
2. ⚙ 클릭 → "작게/중간/크게" 3개 버튼만 뜨는지(글씨체 섹션이 없는지), 선택하면 검색창/카드
   내용 글자 크기가 즉시 바뀌는지 확인.
3. 열려 있는 노트 창의 본문 글자 크기는 리스트 ⚙를 바꿔도 변하지 않는지 확인(반대로 노트
   ⚙를 바꿔도 리스트 표시 크기는 그대로인지).
4. 필터 태그에 마우스를 올리면 살짝 어두워지고, 클릭(토글)하면 진한 배경+흰 글자로 바뀌는지
   확인.
5. 카드 안 태그에 테두리가 보이고 필터 태그와 비슷한 모양인지 확인.
6. 태그를 8개 이상 가진 메모를 만들어서 카드에 "..."가 보이고 클릭하면 나머지 태그가
   펼쳐지는지(메모가 열리지 않는지) 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/renderer/list/ListApp.tsx src/renderer/list/ListApp.css src/renderer/list/NoteCard.tsx
git commit -m "$(cat <<'EOF'
리스트 창: 타이틀바 확대, 글씨 크기 팝오버 축소(listFontSize),
필터 태그 호버, 카드 태그 스타일 통일, 더보기를 "..."로
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

- [ ] **Step 2: 빈 메모 자동 삭제 통합 검증**

Run: `npm run dev` (또는 Xvfb + CDP)

1. 리스트 창에서 "+"로 새 메모를 만든다(창이 자동으로 열림).
2. 아무것도 입력하지 않고 × 클릭으로 닫는다.
3. 리스트 창에 그 메모가 남아있지 않은지 확인한다(즉시 삭제됨).
4. 이번엔 새 메모를 만들어 태그만 하나 달고 본문은 비운 채 닫는다 → 태그가 있어도 본문이
   비어있으면 삭제되는지 확인한다.
5. 이번엔 본문에 텍스트를 입력하고 닫는다 → 정상적으로 숨김 처리되고 리스트에 남아있는지,
   다시 열었을 때 내용이 보존되는지 확인한다(기존 동작 회귀 없음).

- [ ] **Step 3: 두 창 동시 사용 시나리오**

1. 서로 다른 글씨 크기로 설정한 메모 2개를 동시에 열어두고, 리스트 창의 ⚙로 `listFontSize`를
   바꿔본다 → 두 노트 창의 본문 크기는 변하지 않고 리스트 카드 내용 크기만 바뀌는지 확인.
2. 한 노트 창에서 ⚙로 그 메모의 크기를 바꾼 뒤 리스트로 돌아가서 카드가 여전히 리스트 자체
   크기(`listFontSize`)로 표시되는지(메모 자체 크기에 영향받지 않는지) 확인.

- [ ] **Step 4: 발견된 문제가 없으면 완료 기록**

이 태스크는 코드 변경이 없으므로 커밋할 것이 없다. 검증 중 문제를 발견하면 해당 태스크로
돌아가 수정한다.
