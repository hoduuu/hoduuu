# 노트/리스트 창 프레임리스 전환 & 태그 색상 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 노트 창과 리스트 창의 OS 네이티브 타이틀바를 없애고 커스텀 상단 UI로 대체하며, 노트별 폰트 설정을 앱 전역 설정으로 바꾸고, 태그 색상 체계와 리스트 카드 표시를 다듬는다.

**Architecture:** 기존 Electron main/renderer 구조를 그대로 따른다. 두 `BrowserWindow` 모두 `frame: false`로 바꾸고, 렌더러가 `-webkit-app-region: drag`로 드래그 영역을 스스로 그린다. 노트별로 저장하던 `fontFamily`/`fontSize`를 없애고 `electron-store`에 `settings` 키를 새로 두어 앱 전역 설정으로 관리하며, 변경 시 모든 열린 창에 브로드캐스트한다.

**Tech Stack:** Electron, React 18, TypeScript, electron-store 8.x, Vitest (기존 스택 그대로, 신규 의존성 없음)

## Global Constraints

- 참조 스펙: `docs/superpowers/specs/2026-08-13-window-chrome-tag-colors-design.md`
- 노트 창은 리스트 창만, 리스트 창은 노트 창만 신경 쓰지 않고 각자 독립적으로 프레임리스로 바뀐다 — 둘 다 `frame: false`.
- 자동화 테스트(Vitest)는 순수 로직(`noteColors.ts`, `store.ts`의 CRUD/설정)에 한정한다. 창 생성/프레임/드래그/리사이즈 같은 OS 레벨 동작과 React UI는 수동(Xvfb+CDP 또는 `npm run dev` + devtools)으로 검증한다.
- 폰트/크기는 노트별이 아니라 앱 전역 설정 하나로 관리한다 — 노트마다 다른 글꼴을 쓸 수 없다.
- 글자 굵게/기울임/밑줄/형광펜 등 리치 텍스트 서식 기능은 이번 계획의 범위가 아니다.
- 태그 입력창은 지금처럼 "+" 버튼 옆에 항상 보이는 상태를 유지한다(숨김/토글로 바꾸지 않는다).
- 노트 창을 닫으면(×) 지금과 동일하게 창은 숨기고 데이터는 지우지 않는다(`isOpen: false`).

---

## File Structure

```
src/
  shared/
    types.ts        - StickyNote(fontFamily/fontSize 제거), AppSettings(신규),
                       IPC_CHANNELS(OPEN_LIST/GET_SETTINGS/UPDATE_SETTINGS/SETTINGS_CHANGED 추가),
                       NotesAPI(openListWindow/getSettings/updateSettings/onSettingsChanged 추가)
    noteColors.ts    - (신규) NOTE_COLORS, getDarkColor()
    fonts.ts         - (신규) FONT_FAMILIES, FONT_SIZES (NoteApp.tsx에서 이동)
  main/
    store.ts         - settings 키 추가(getSettings/updateSettings), 노트별 폰트 필드 제거
    ipc.ts           - OPEN_LIST/GET_SETTINGS/UPDATE_SETTINGS 핸들러 추가
    windows.ts       - 두 BrowserWindow 모두 frame:false
    index.ts         - openListWindow 콜백 배선
  preload/
    index.ts         - notesAPI에 openListWindow/getSettings/updateSettings/onSettingsChanged 추가
  renderer/
    note/
      NoteApp.tsx    - Aa 팝오버 삭제, 전역 설정 구독, ☰/📌/× 아이콘 그룹, 드래그 리전
      NoteApp.css    - 드래그 리전, 메뉴/닫기 버튼 스타일, 태그 글자색
    list/
      ListApp.tsx    - 커스텀 타이틀바(드래그+설정+닫기), 태그 토글 색상, 최신순 정렬
      ListApp.css    - 타이틀바/설정 팝오버/더보기 스타일
      NoteCard.tsx   - (신규) 리스트 카드 하나를 렌더링하는 컴포넌트, 태그 더보기 로컬 state 보유
tests/
  noteColors.test.ts - (신규)
  store.test.ts      - settings 관련 테스트 추가
  noteUtils.test.ts  - makeNote 헬퍼에서 fontFamily/fontSize 제거
```

---

### Task 1: 공용 타입 확장 & 태그 진한색/폰트 상수 (TDD)

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/shared/noteColors.ts`
- Create: `src/shared/fonts.ts`
- Test: `tests/noteColors.test.ts`

**Interfaces:**
- Consumes: 없음 (공용 기반 모듈)
- Produces: `NOTE_COLORS: {light: string; dark: string}[]`, `getDarkColor(light: string): string`,
  `FONT_FAMILIES: {label: string; value: string}[]`, `FONT_SIZES: number[]`,
  `AppSettings { fontFamily: string; fontSize: number }`,
  `IPC_CHANNELS.OPEN_LIST/GET_SETTINGS/UPDATE_SETTINGS/SETTINGS_CHANGED`,
  `NotesAPI.openListWindow/getSettings/updateSettings/onSettingsChanged`
  — Task 2~5가 사용. `StickyNote`의 `fontFamily`/`fontSize` 필드는 이 태스크에서는 그대로 두고
  Task 6에서 제거한다(중간 태스크들의 컴파일이 계속 통과하도록 하기 위함).

- [ ] **Step 1: 실패하는 테스트 작성 (`tests/noteColors.test.ts`)**

```typescript
import { describe, it, expect } from 'vitest';
import { NOTE_COLORS, getDarkColor } from '../src/shared/noteColors';

describe('NOTE_COLORS', () => {
  it('has exactly 5 light/dark color pairs, each a valid hex color', () => {
    expect(NOTE_COLORS).toHaveLength(5);
    for (const { light, dark } of NOTE_COLORS) {
      expect(light).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(dark).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('keeps the existing note palette as the light values, in order', () => {
    expect(NOTE_COLORS.map((c) => c.light)).toEqual([
      '#FFF59D',
      '#FFCCBC',
      '#C8E6C9',
      '#B3E5FC',
      '#E1BEE7',
    ]);
  });
});

describe('getDarkColor', () => {
  it('returns the dark counterpart for a known light color', () => {
    expect(getDarkColor('#FFF59D')).toBe('#8D6E00');
    expect(getDarkColor('#E1BEE7')).toBe('#6A1B9A');
  });

  it('falls back to the input value for an unknown color', () => {
    expect(getDarkColor('#123456')).toBe('#123456');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- noteColors`
Expected: FAIL — `src/shared/noteColors.ts`가 없어서 import 에러

- [ ] **Step 3: 구현 작성 (`src/shared/noteColors.ts`)**

```typescript
export const NOTE_COLORS: { light: string; dark: string }[] = [
  { light: '#FFF59D', dark: '#8D6E00' },
  { light: '#FFCCBC', dark: '#AD1457' },
  { light: '#C8E6C9', dark: '#2E7D32' },
  { light: '#B3E5FC', dark: '#0277BD' },
  { light: '#E1BEE7', dark: '#6A1B9A' },
];

export function getDarkColor(light: string): string {
  return NOTE_COLORS.find((c) => c.light === light)?.dark ?? light;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- noteColors`
Expected: PASS (4개 테스트 모두 통과)

- [ ] **Step 5: 폰트 상수 이동 (`src/shared/fonts.ts` 신규 생성)**

```typescript
export const FONT_FAMILIES = [
  { label: '기본', value: 'sans-serif' },
  { label: '명조', value: 'serif' },
  { label: '고정폭', value: 'monospace' },
  { label: '손글씨', value: 'cursive' },
];

export const FONT_SIZES = [12, 14, 16, 18, 22];
```

- [ ] **Step 6: `src/shared/types.ts`에 설정/IPC/API 타입 추가 (전체 교체)**

```typescript
export interface StickyNote {
  id: string;
  content: string;
  color: string;
  tags: string[];
  position: { x: number; y: number };
  size: { width: number; height: number };
  fontFamily: string;
  fontSize: number;
  alwaysOnTop: boolean;
  isOpen: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  fontFamily: string;
  fontSize: number;
}

export interface NotesAPI {
  getAll: () => Promise<StickyNote[]>;
  create: (partial?: Partial<StickyNote>) => Promise<StickyNote | null>;
  update: (id: string, changes: Partial<StickyNote>) => Promise<StickyNote | null>;
  remove: (id: string) => Promise<boolean | null>;
  openNoteWindow: (id: string) => Promise<void>;
  openListWindow: () => Promise<void>;
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

- [ ] **Step 7: 전체 회귀 확인**

Run: `npm run typecheck && npm test`
Expected: PASS — `StickyNote`에 필드를 뺀 게 아니라 타입/상수만 추가했으므로 기존 코드는 전부 그대로 컴파일된다.

- [ ] **Step 8: 커밋**

```bash
git add src/shared/types.ts src/shared/noteColors.ts src/shared/fonts.ts tests/noteColors.test.ts
git commit -m "$(cat <<'EOF'
공용 타입 확장: 태그 진한색 팔레트, 전역 폰트 설정 타입/IPC 채널 추가
EOF
)"
```

---

### Task 2: `store.ts` — 앱 전역 설정 저장/조회 (TDD)

**Files:**
- Modify: `src/main/store.ts`
- Modify: `tests/store.test.ts`

**Interfaces:**
- Consumes: `AppSettings` (Task 1)
- Produces: `NoteStore.getSettings(): AppSettings`, `NoteStore.updateSettings(changes: Partial<AppSettings>): AppSettings`
  — Task 3(`ipc.ts`)가 사용

- [ ] **Step 1: 실패하는 테스트 추가 (`tests/store.test.ts`의 `describe('createNoteStore', ...)` 블록 안, 기존 테스트들 뒤에 추가)**

```typescript
  it('returns default settings before any update', () => {
    const store = createNoteStore(tmpDir);
    expect(store.getSettings()).toEqual({ fontFamily: 'sans-serif', fontSize: 14 });
  });

  it('updates settings and merges with the existing values', () => {
    const store = createNoteStore(tmpDir);
    const updated = store.updateSettings({ fontSize: 18 });
    expect(updated).toEqual({ fontFamily: 'sans-serif', fontSize: 18 });
    expect(store.getSettings()).toEqual({ fontFamily: 'sans-serif', fontSize: 18 });
  });

  it('persists settings across store instances backed by the same directory', () => {
    const store = createNoteStore(tmpDir);
    store.updateSettings({ fontFamily: 'serif', fontSize: 22 });
    const reopened = createNoteStore(tmpDir);
    expect(reopened.getSettings()).toEqual({ fontFamily: 'serif', fontSize: 22 });
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- store`
Expected: FAIL — `store.getSettings is not a function`

- [ ] **Step 3: 구현 작성 (`src/main/store.ts` 전체 교체)**

```typescript
import Store from 'electron-store';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppSettings, StickyNote } from '../shared/types';

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
    const updated = { ...getSettings(), ...changes };
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
      fontFamily: partial.fontFamily ?? DEFAULT_FONT_FAMILY,
      fontSize: partial.fontSize ?? DEFAULT_FONT_SIZE,
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
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(filePath, backupPath);
    }
    fs.rmSync(filePath);
  }
}

export type NoteStore = ReturnType<typeof createNoteStore>;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- store`
Expected: PASS (기존 9개 + 신규 3개 = 12개 테스트 모두 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/main/store.ts tests/store.test.ts
git commit -m "$(cat <<'EOF'
store: 앱 전역 폰트/크기 설정(settings) 저장·조회 추가
EOF
)"
```

---

### Task 3: Main 프로세스 배선 — 프레임리스 창 + 리스트 열기/설정 IPC (수동 검증)

**Files:**
- Modify: `src/main/windows.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `NoteStore.getSettings/updateSettings` (Task 2), `IPC_CHANNELS.OPEN_LIST/GET_SETTINGS/UPDATE_SETTINGS/SETTINGS_CHANGED`,
  `NotesAPI.openListWindow/getSettings/updateSettings/onSettingsChanged` (Task 1)
- Produces: `frame:false`로 뜨는 두 창, 렌더러에서 호출 가능한 `notesAPI.openListWindow()`,
  `notesAPI.getSettings()`, `notesAPI.updateSettings()`, `notesAPI.onSettingsChanged()`
  — Task 4, 5가 사용

이 태스크는 Electron 런타임(윈도우 프레임, IPC 배선) 자체를 다루므로 자동화 단위 테스트 대신
수동 검증으로 확인한다(Global Constraints 참고).

- [ ] **Step 1: `src/main/windows.ts`에서 두 `BrowserWindow` 모두 `frame: false`로 바꾸기**

`createListWindow`의 `BrowserWindow` 생성 부분(현재 `autoHideMenuBar: true`와
`listWindow.setMenuBarVisibility(false);`가 있는 부분)을 다음으로 바꾼다:

```typescript
  listWindow = new BrowserWindow({
    width: 360,
    height: 600,
    frame: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js') },
  });
  loadRendererPage(listWindow, 'list');
```

(`listWindow.setMenuBarVisibility(false);` 줄은 삭제한다 — 프레임이 없으면 의미가 없다.)

`openNoteWindow`의 `BrowserWindow` 생성 부분(현재 `autoHideMenuBar: true`와
`win.setMenuBarVisibility(false);`가 있는 부분)을 다음으로 바꾼다:

```typescript
  const win = new BrowserWindow({
    width: note.size.width,
    height: note.size.height,
    x: note.position.x,
    y: note.position.y,
    alwaysOnTop: note.alwaysOnTop,
    frame: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      additionalArguments: [`--note-id=${id}`],
    },
  });
  loadRendererPage(win, 'note');
```

(`win.setMenuBarVisibility(false);` 줄도 삭제한다.) 나머지(`win.on('close', ...)`, `move`/`resize`
디바운스 저장, 트레이/PNG 생성 헬퍼 등)는 전혀 건드리지 않는다.

- [ ] **Step 2: `src/main/ipc.ts`에 리스트 열기 · 설정 IPC 핸들러 추가 (전체 교체)**

```typescript
import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import type { AppSettings, StickyNote } from '../shared/types';
import type { NoteStore } from './store';

interface WindowCallbacks {
  openNoteWindow: (id: string) => void;
  openListWindow: () => void;
  setNoteAlwaysOnTop: (id: string, value: boolean) => void;
  closeNoteWindow: (id: string) => void;
}

export function registerIpcHandlers(store: NoteStore, callbacks: WindowCallbacks): void {
  ipcMain.handle(IPC_CHANNELS.GET_ALL, () => store.getAllNotes());

  ipcMain.handle(IPC_CHANNELS.CREATE, (event, partial?: Partial<StickyNote>) =>
    withSaveErrorHandling(event, () => {
      const note = store.createNote(partial);
      broadcastChanged(store);
      return note;
    }),
  );

  ipcMain.handle(IPC_CHANNELS.UPDATE, (event, id: string, changes: Partial<StickyNote>) =>
    withSaveErrorHandling(event, () => {
      const updated = store.updateNote(id, changes);
      if (updated && changes.alwaysOnTop !== undefined) {
        callbacks.setNoteAlwaysOnTop(id, changes.alwaysOnTop);
      }
      broadcastChanged(store);
      return updated;
    }),
  );

  ipcMain.handle(IPC_CHANNELS.DELETE, (event, id: string) =>
    withSaveErrorHandling(event, () => {
      const removed = store.deleteNote(id);
      if (removed) {
        callbacks.closeNoteWindow(id);
      }
      broadcastChanged(store);
      return removed;
    }),
  );

  ipcMain.handle(IPC_CHANNELS.OPEN_WINDOW, (_event, id: string) => {
    callbacks.openNoteWindow(id);
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_LIST, () => {
    callbacks.openListWindow();
  });

  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => store.getSettings());

  ipcMain.handle(IPC_CHANNELS.UPDATE_SETTINGS, (event, changes: Partial<AppSettings>) =>
    withSaveErrorHandling(event, () => {
      const updated = store.updateSettings(changes);
      broadcastSettingsChanged(updated);
      return updated;
    }),
  );
}

function withSaveErrorHandling<T>(event: IpcMainInvokeEvent, fn: () => T): T | null {
  try {
    return fn();
  } catch (error) {
    const message = toReadableErrorMessage(error);
    event.sender.send(IPC_CHANNELS.SAVE_ERROR, `저장 실패: ${message}`);
    return null;
  }
}

export function toReadableErrorMessage(error: unknown): string {
  if (error instanceof RangeError && error.message.includes('call stack')) {
    return '파일에 쓸 수 없습니다 (권한을 확인해주세요)';
  }
  return error instanceof Error ? error.message : String(error);
}

function broadcastChanged(store: NoteStore): void {
  const notes = store.getAllNotes();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.CHANGED, notes);
  }
}

function broadcastSettingsChanged(settings: AppSettings): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, settings);
  }
}
```

(주석이 있던 `toReadableErrorMessage`의 설명 주석은 원본 그대로 유지해도 되고 생략해도 무방하다 —
동작에 영향 없음. 위 코드는 핵심 로직만 보여준다.)

- [ ] **Step 3: `src/preload/index.ts`에 새 메서드 4개 추가 (전체 교체)**

```typescript
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import type { AppSettings, NotesAPI, StickyNote } from '../shared/types';

const notesAPI: NotesAPI = {
  getAll: () => ipcRenderer.invoke(IPC_CHANNELS.GET_ALL),
  create: (partial) => ipcRenderer.invoke(IPC_CHANNELS.CREATE, partial),
  update: (id, changes) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE, id, changes),
  remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.DELETE, id),
  openNoteWindow: (id) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_WINDOW, id),
  openListWindow: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_LIST),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  updateSettings: (changes) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SETTINGS, changes),
  onNotesChanged: (callback) => {
    const listener = (_event: IpcRendererEvent, notes: StickyNote[]) => callback(notes);
    ipcRenderer.on(IPC_CHANNELS.CHANGED, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHANGED, listener);
  },
  onSaveError: (callback) => {
    const listener = (_event: IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on(IPC_CHANNELS.SAVE_ERROR, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SAVE_ERROR, listener);
  },
  onSettingsChanged: (callback) => {
    const listener = (_event: IpcRendererEvent, settings: AppSettings) => callback(settings);
    ipcRenderer.on(IPC_CHANNELS.SETTINGS_CHANGED, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SETTINGS_CHANGED, listener);
  },
};

contextBridge.exposeInMainWorld('notesAPI', notesAPI);

function getNoteId(): string | null {
  const arg = process.argv.find((a) => a.startsWith('--note-id='));
  return arg ? arg.slice('--note-id='.length) : null;
}

contextBridge.exposeInMainWorld('noteId', getNoteId());
```

- [ ] **Step 4: `src/main/index.ts`에 `openListWindow` 콜백 배선 (전체 교체)**

```typescript
import { app, BrowserWindow } from 'electron';
import { createNoteStore } from './store';
import { registerIpcHandlers } from './ipc';
import {
  createListWindow,
  openNoteWindow,
  restoreOpenNoteWindows,
  setNoteAlwaysOnTop,
  closeNoteWindow,
  createTray,
} from './windows';

app.whenReady().then(() => {
  const store = createNoteStore(app.getPath('userData'));

  registerIpcHandlers(store, {
    openNoteWindow: (id) => openNoteWindow(store, id),
    openListWindow: () => {
      createListWindow();
    },
    setNoteAlwaysOnTop,
    closeNoteWindow: (id) => closeNoteWindow(id),
  });

  createTray(() => createListWindow());
  createListWindow();
  restoreOpenNoteWindows(store);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createListWindow();
  });
});

app.on('window-all-closed', () => {
  // 트레이에 상주해야 하므로 창이 모두 닫혀도 앱을 종료하지 않는다.
  // 종료는 트레이 메뉴의 "종료"를 통해서만 이루어진다.
});
```

- [ ] **Step 5: 타입 확인**

Run: `npm run typecheck`
Expected: PASS (아직 렌더러 UI는 옛 모습이지만, 새 IPC 배선까지는 타입이 전부 맞아야 한다)

- [ ] **Step 6: 수동 검증**

Run: `npm run dev` (또는 Xvfb + CDP로 헤드리스 실행)

1. 리스트 창과, 노트 창을 하나 열어서 — 두 창 모두 OS 타이틀바가 사라졌는지 확인.
2. 노트 창 devtools 콘솔에서:
   ```js
   await window.notesAPI.openListWindow();
   ```
   리스트 창이 열려 있지 않았다면 새로 뜨고, 열려 있었다면 포커스만 이동하는지 확인.
3. 아무 창의 콘솔에서:
   ```js
   await window.notesAPI.getSettings(); // { fontFamily: 'sans-serif', fontSize: 14 }
   await window.notesAPI.updateSettings({ fontSize: 18 });
   await window.notesAPI.getSettings(); // { fontFamily: 'sans-serif', fontSize: 18 }
   ```
4. 노트 창 콘솔에서 `window.notesAPI.onSettingsChanged((s) => console.log('changed', s))`를 등록해두고,
   다른 창(또는 같은 창) 콘솔에서 `updateSettings`를 다시 호출 → 콘솔에 `changed {...}`가 찍히는지 확인.
5. 노트 창 가장자리를 드래그해 리사이즈가 여전히 되는지 확인(프레임 제거 전과 동일해야 함).

- [ ] **Step 7: 커밋**

```bash
git add src/main/windows.ts src/main/ipc.ts src/preload/index.ts src/main/index.ts
git commit -m "$(cat <<'EOF'
main: 노트/리스트 창 frame:false 전환, 리스트 열기·전역 설정 IPC 배선
EOF
)"
```

---

### Task 4: 노트 창 UI — 프레임리스 툴바 재구성

**Files:**
- Modify: `src/renderer/note/NoteApp.tsx`
- Modify: `src/renderer/note/NoteApp.css`

**Interfaces:**
- Consumes: `AppSettings`, `notesAPI.getSettings/onSettingsChanged/openListWindow` (Task 1, 3),
  `NOTE_COLORS`/`getDarkColor` (Task 1, `src/shared/noteColors.ts`)
- Produces: 갱신된 `NoteApp` 컴포넌트 (외부에 새로 노출하는 것 없음)

이 태스크는 순수 UI 변경이라 새 Vitest 대상 로직은 없다. 수동 검증으로 확인한다.

- [ ] **Step 1: `src/renderer/note/NoteApp.tsx` 전체 교체**

```tsx
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
          <button className="note-app__close" onClick={() => window.close()} title="닫기">
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
  gap: 3px;
  padding: 5px 6px;
  -webkit-app-region: drag;
}
.note-app__toolbar-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 3px;
  flex: 1 1 auto;
  min-width: 0;
}
.note-app__swatch {
  width: 15px;
  height: 15px;
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
  gap: 3px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.note-app__menu {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
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
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(0, 0, 0, 0.55);
  cursor: pointer;
  flex-shrink: 0;
}
.note-app__pin:hover { background: rgba(0, 0, 0, 0.08); }
.note-app__pin.active { color: #d84315; background: rgba(255, 255, 255, 0.55); }

.note-app__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(0, 0, 0, 0.55);
  font-size: 16px;
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

- [ ] **Step 3: 타입 확인**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: 수동 검증**

Run: `npm run dev` (또는 Xvfb + CDP)

1. 노트 창을 열고 툴바(색상 5개 + ☰ + 📌 + ×)가 기본 240px 폭에서 한 줄에 들어가는지 확인.
2. 툴바의 빈 공간(스와치/아이콘 사이)을 드래그하면 창이 이동하는지, 반대로 버튼을 클릭했을 때는
   드래그로 오작동하지 않고 정상적으로 클릭되는지 확인.
3. ☰ 클릭 → 리스트 창이 열리는지(또는 이미 열려 있으면 포커스되는지) 확인.
4. 📌 클릭 → 기존과 동일하게 `alwaysOnTop`이 토글되는지 확인.
5. × 클릭 → 창이 숨겨지고, 리스트 창에서 이 노트를 다시 열었을 때 내용이 그대로 남아있는지(즉
   `isOpen:false`만 저장되고 데이터는 삭제되지 않았는지) 확인.
6. 태그를 하나 추가하고, 태그 pill의 글자색이 노트 배경색보다 진한 같은 계열 색인지 확인(예: 보라
   노트라면 진한 보라 글자).
7. 창 가장자리 드래그로 리사이즈가 여전히 되는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/renderer/note/NoteApp.tsx src/renderer/note/NoteApp.css
git commit -m "$(cat <<'EOF'
노트 창: Aa 폰트 팝오버 삭제, 전역 설정 구독, 메뉴/닫기 아이콘 추가
EOF
)"
```

---

### Task 5: 리스트 창 UI — 커스텀 타이틀바 + 설정 팝오버 + 태그 색상/더보기 + 최신순 정렬

**Files:**
- Create: `src/renderer/list/NoteCard.tsx`
- Modify: `src/renderer/list/ListApp.tsx`
- Modify: `src/renderer/list/ListApp.css`

**Interfaces:**
- Consumes: `notesAPI.getSettings/updateSettings/onSettingsChanged` (Task 1, 3),
  `FONT_FAMILIES`/`FONT_SIZES` (Task 1, `src/shared/fonts.ts`), `NOTE_COLORS`/`getDarkColor`
  (Task 1, `src/shared/noteColors.ts`), `collectAllTags`/`collectTagColors`/`filterNotes`/`formatNoteDate`
  (기존 `src/shared/noteUtils.ts`, 변경 없음)
- Produces: `NoteCard` 컴포넌트 (`{ note: StickyNote; tagColors: Record<string, string>; onOpen: () => void; onDelete: () => void }` props), 갱신된 `ListApp`

이 태스크도 순수 UI 변경이라 새 Vitest 대상 로직은 없다. 수동 검증으로 확인한다.

- [ ] **Step 1: `src/renderer/list/NoteCard.tsx` 신규 생성**

```tsx
import { useState } from 'react';
import type { StickyNote } from '../../shared/types';
import { formatNoteDate } from '../../shared/noteUtils';
import { getDarkColor } from '../../shared/noteColors';

const MAX_VISIBLE_TAGS = 3;

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
              +{hiddenCount} 더보기
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
```

- [ ] **Step 2: `src/renderer/list/ListApp.tsx` 전체 교체**

```tsx
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
```

- [ ] **Step 3: `src/renderer/list/ListApp.css` 전체 교체**

```css
html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
#root { height: 100%; }

.list-app { display: flex; flex-direction: column; height: 100vh; font-family: sans-serif; }

.list-app__titlebar {
  display: flex;
  align-items: center;
  height: 24px;
  padding: 0 4px;
  flex-shrink: 0;
  -webkit-app-region: drag;
}
.list-app__titlebar-drag { flex: 1; height: 100%; }

.list-app__settings-widget { position: relative; -webkit-app-region: no-drag; }
.list-app__settings-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
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
  width: 130px;
  max-height: 200px;
  overflow-y: auto;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.list-app__settings-section { display: flex; flex-direction: column; gap: 1px; }
.list-app__settings-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(0, 0, 0, 0.4);
  padding: 2px 6px 1px;
}
.list-app__settings-option {
  text-align: left;
  border: none;
  background: transparent;
  border-radius: 5px;
  padding: 4px 6px;
  font-size: 12px;
  color: #333;
  cursor: pointer;
}
.list-app__settings-option:hover { background: rgba(0, 0, 0, 0.06); }
.list-app__settings-option.active { background: rgba(0, 0, 0, 0.08); font-weight: 700; }

.list-app__titlebar-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(0, 0, 0, 0.55);
  font-size: 15px;
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
}
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
  font-size: 14px;
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
  border-radius: 999px;
  padding: 1px 8px;
}
.list-app__note-tag-more {
  font-size: 11px;
  border-radius: 999px;
  padding: 1px 8px;
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

- [ ] **Step 4: 타입 확인**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: 수동 검증**

Run: `npm run dev` (또는 Xvfb + CDP)

1. 리스트 창 타이틀바(⚙ + ×) 왼쪽 빈 공간을 드래그하면 창이 이동하는지 확인.
2. ⚙ 클릭 → 팝오버가 열리고 글씨체/크기를 선택하면, 열려 있는 노트 창의 본문 폰트가 즉시
   바뀌는지 확인(노트 창을 하나 띄워둔 채로 테스트).
3. 태그가 여러 개인 상태에서 필터 태그 하나를 클릭(토글) → 배경이 진한 색 + 흰 글자로 바뀌는지,
   다시 클릭하면 원래 파스텔 배경으로 돌아오는지 확인.
4. 태그를 4개 이상 가진 메모를 하나 만들어서, 카드에 "더보기" 버튼이 보이고 클릭 시 카드 안에서
   나머지 태그가 펼쳐지는지, 이때 메모가 열리지 않는지(더보기 클릭이 카드 열기로 새지 않는지) 확인.
5. 새 메모(+)를 만들면 리스트 맨 위에 나타나는지 확인.
6. × 클릭 → 리스트 창이 닫히는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/renderer/list/NoteCard.tsx src/renderer/list/ListApp.tsx src/renderer/list/ListApp.css
git commit -m "$(cat <<'EOF'
리스트 창: 커스텀 타이틀바(설정 팝오버+닫기), 태그 토글 색상, 카드
더보기, 최신순 정렬
EOF
)"
```

---

### Task 6: 정리 — 노트별 폰트 필드 제거 & 전체 회귀 확인

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/store.ts`
- Modify: `tests/noteUtils.test.ts`

**Interfaces:**
- Consumes: 없음 (마무리 정리)
- Produces: 없음 (기존 공개 인터페이스 변경 없음 — `StickyNote`에서 이제 아무도 안 쓰는 필드만 제거)

Task 4, 5에서 노트 창/리스트 창 모두 `note.fontFamily`/`note.fontSize` 대신 전역 `settings`를 쓰도록
이미 바꿨으므로, 이제 `StickyNote`에서 죽은 필드를 정리한다.

- [ ] **Step 1: `src/shared/types.ts`에서 `StickyNote`의 `fontFamily`/`fontSize` 제거**

`StickyNote` 인터페이스를 다음으로 바꾼다(다른 타입/상수는 그대로 둔다):

```typescript
export interface StickyNote {
  id: string;
  content: string;
  color: string;
  tags: string[];
  position: { x: number; y: number };
  size: { width: number; height: number };
  alwaysOnTop: boolean;
  isOpen: boolean;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: `src/main/store.ts`의 `createNote`에서 폰트 필드 대입 제거**

`createNote` 안의 다음 두 줄을 지운다:

```typescript
      fontFamily: partial.fontFamily ?? DEFAULT_FONT_FAMILY,
      fontSize: partial.fontSize ?? DEFAULT_FONT_SIZE,
```

(`DEFAULT_FONT_FAMILY`/`DEFAULT_FONT_SIZE` 상수 자체는 `settings`의 기본값으로 계속 쓰이므로 그대로
둔다.)

- [ ] **Step 3: `tests/noteUtils.test.ts`의 `makeNote` 헬퍼에서 `fontFamily`/`fontSize` 제거**

`makeNote` 함수 안의 다음 두 줄을 지운다:

```typescript
    fontFamily: 'sans-serif',
    fontSize: 14,
```

- [ ] **Step 4: 전체 회귀 확인**

Run: `npm run typecheck && npm test && npm run build`
Expected: 셋 다 PASS. `typecheck`가 통과한다는 것은 `fontFamily`/`fontSize`를 참조하는 코드가
더 이상 하나도 남지 않았다는 뜻이다(남아있었다면 여기서 컴파일 에러로 드러난다).

- [ ] **Step 5: 커밋**

```bash
git add src/shared/types.ts src/main/store.ts tests/noteUtils.test.ts
git commit -m "$(cat <<'EOF'
정리: 노트별 fontFamily/fontSize 필드 제거 (전역 설정으로 대체 완료)
EOF
)"
```
