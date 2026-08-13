# 스티커 메모 앱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면에 자유롭게 띄우는 스티커 메모 창과, 태그/텍스트로 검색·분류하는 리스트 창으로
구성된 크로스플랫폼 데스크톱 앱을 만든다.

**Architecture:** Electron main 프로세스가 로컬 JSON 저장소(`electron-store`)를 소유하고,
IPC를 통해 리스트 창 1개 + 노트 창 N개(React)와 통신한다. 데이터 변경은 항상 main을 거치고,
변경 후 열려 있는 모든 창에 브로드캐스트되어 실시간 동기화된다.

**Tech Stack:** Electron, electron-vite, React 18, TypeScript, electron-store 8.x, Vitest

## Global Constraints

- 크로스플랫폼 데스크톱 앱(macOS/Windows/Linux), Electron 기반.
- UI는 React + TypeScript로 작성한다.
- 데이터는 `electron-store` 기반 로컬 JSON 파일에만 저장한다. SQLite 등 네이티브 DB, 클라우드
  동기화는 사용하지 않는다.
- 노트 창을 X로 닫으면 창만 숨기고(`isOpen: false`) 데이터는 삭제하지 않는다. 데이터 삭제는
  리스트 창에서 확인 다이얼로그를 거친 뒤에만 수행한다.
- 앱을 재시작하면 종료 시점에 `isOpen: true`였던 노트 창을 모두 자동으로 다시 연다.
- 자동화 테스트(Vitest)는 순수 로직(태그 파싱/검색 필터링, 데이터 CRUD, 디바운스)에 한정한다.
  창 생성/드래그/리사이즈/트레이 같은 OS 레벨 동작과 React UI는 수동 검증한다.
- 글꼴/글자 크기 커스터마이징은 이번 스펙 범위가 아니며 구현하지 않는다.

---

## File Structure

```
package.json
tsconfig.json
tsconfig.node.json
electron.vite.config.ts
electron-builder.yml
src/
  shared/
    types.ts          - StickyNote, NotesAPI, IPC_CHANNELS (main/preload/renderer 공용)
    noteUtils.ts        - normalizeTagInput, filterNotes, collectAllTags
    debounce.ts          - 범용 debounce 유틸
  main/
    index.ts             - 앱 엔트리: store/ipc/tray/윈도우 초기화
    store.ts              - electron-store 래퍼: CRUD + 손상 파일 복구
    ipc.ts                 - ipcMain 핸들러 등록, 변경 브로드캐스트, 저장 실패 이벤트
    windows.ts              - 리스트/노트 BrowserWindow 생성·재사용·트레이 관리
  preload/
    index.ts                 - contextBridge로 notesAPI, noteId 노출
  renderer/
    list.html
    note.html
    list/
      main.tsx
      ListApp.tsx
      ListApp.css
    note/
      main.tsx
      NoteApp.tsx
      NoteApp.css
tests/
  noteUtils.test.ts
  debounce.test.ts
  store.test.ts
```

---

### Task 1: 프로젝트 스캐폴딩 (Electron + Vite + React + TS, 멀티 윈도우)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `electron.vite.config.ts`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/list.html`, `src/renderer/list/main.tsx`, `src/renderer/list/ListApp.tsx`
- Create: `src/renderer/note.html`, `src/renderer/note/main.tsx`, `src/renderer/note/NoteApp.tsx`
- Create: `.gitignore`

**Interfaces:**
- Produces: `npm run dev` (개발 실행), `npm run build` (빌드), `npm test` (Vitest), `npm run typecheck`

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "sticky-notes",
  "version": "0.1.0",
  "private": true,
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "dist": "electron-vite build && electron-builder",
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "electron-store": "^8.2.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "electron": "^31.0.0",
    "electron-builder": "^24.13.3",
    "electron-vite": "^2.3.0",
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: tsconfig.json (renderer/shared용) 작성**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src/renderer/**/*", "src/shared/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: tsconfig.node.json (main/preload용) 작성**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "CommonJS",
    "moduleResolution": "Node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*"]
}
```

- [ ] **Step 4: electron.vite.config.ts 작성 (리스트/노트 2개의 renderer 진입점)**

```typescript
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          list: resolve(__dirname, 'src/renderer/list.html'),
          note: resolve(__dirname, 'src/renderer/note.html'),
        },
      },
    },
    plugins: [react()],
  },
});
```

- [ ] **Step 5: main 프로세스 최소 엔트리 작성 (`src/main/index.ts`)**

```typescript
import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 360,
    height: 600,
    webPreferences: { preload: join(__dirname, '../preload/index.js') },
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/list.html`);
  } else {
    win.loadFile(join(__dirname, '../renderer/list.html'));
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 6: preload 최소 엔트리 작성 (`src/preload/index.ts`)**

```typescript
// 이후 Task 4에서 notesAPI를 이 파일에 노출한다.
export {};
```

- [ ] **Step 7: renderer HTML/엔트리 파일 작성**

`src/renderer/list.html`:
```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>스티커 메모 목록</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="./list/main.tsx"></script>
  </body>
</html>
```

`src/renderer/list/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client';
import { ListApp } from './ListApp';

createRoot(document.getElementById('root')!).render(<ListApp />);
```

`src/renderer/list/ListApp.tsx`:
```tsx
export function ListApp() {
  return <div>list placeholder</div>;
}
```

`src/renderer/note.html`:
```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>스티커 메모</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="./note/main.tsx"></script>
  </body>
</html>
```

`src/renderer/note/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client';
import { NoteApp } from './NoteApp';

createRoot(document.getElementById('root')!).render(<NoteApp />);
```

`src/renderer/note/NoteApp.tsx`:
```tsx
export function NoteApp() {
  return <div>note placeholder</div>;
}
```

- [ ] **Step 8: .gitignore 작성**

```
node_modules/
out/
dist/
*.log
```

- [ ] **Step 9: 의존성 설치**

Run: `npm install`

- [ ] **Step 10: 개발 서버로 수동 확인**

Run: `npm run dev`
Expected: Electron 창이 열리고 "list placeholder" 텍스트가 보인다. 창을 닫으면 프로세스가 종료된다.

- [ ] **Step 11: 커밋**

```bash
git add package.json tsconfig.json tsconfig.node.json electron.vite.config.ts .gitignore src/main/index.ts src/preload/index.ts src/renderer
git commit -m "chore: scaffold electron-vite + react + ts project"
```

---

### Task 2: 공용 타입 & 태그/검색 유틸리티 (TDD)

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/noteUtils.ts`
- Test: `tests/noteUtils.test.ts`

**Interfaces:**
- Consumes: 없음 (최하위 레이어)
- Produces:
  - `StickyNote` 인터페이스, `NotesAPI` 인터페이스, `IPC_CHANNELS` 상수 — Task 3~7이 사용
  - `normalizeTagInput(raw: string): string[]`
  - `filterNotes(notes: StickyNote[], query: string): StickyNote[]`
  - `collectAllTags(notes: StickyNote[]): string[]`

- [ ] **Step 1: 공용 타입 작성 (`src/shared/types.ts`)**

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

export interface NotesAPI {
  getAll: () => Promise<StickyNote[]>;
  create: (partial?: Partial<StickyNote>) => Promise<StickyNote>;
  update: (id: string, changes: Partial<StickyNote>) => Promise<StickyNote | null>;
  remove: (id: string) => Promise<boolean>;
  openNoteWindow: (id: string) => Promise<void>;
  onNotesChanged: (callback: (notes: StickyNote[]) => void) => () => void;
  onSaveError: (callback: (message: string) => void) => () => void;
}

export const IPC_CHANNELS = {
  GET_ALL: 'notes:getAll',
  CREATE: 'notes:create',
  UPDATE: 'notes:update',
  DELETE: 'notes:delete',
  OPEN_WINDOW: 'notes:openWindow',
  CHANGED: 'notes:changed',
  SAVE_ERROR: 'notes:saveError',
} as const;

declare global {
  interface Window {
    notesAPI: NotesAPI;
    noteId: string | null;
  }
}
```

- [ ] **Step 2: 실패하는 테스트 작성 (`tests/noteUtils.test.ts`)**

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeTagInput, filterNotes, collectAllTags } from '../src/shared/noteUtils';
import type { StickyNote } from '../src/shared/types';

describe('normalizeTagInput', () => {
  it('strips leading # and trims whitespace', () => {
    expect(normalizeTagInput('#API키, #깃허브')).toEqual(['API키', '깃허브']);
  });

  it('splits on whitespace when no commas are present', () => {
    expect(normalizeTagInput('#foo #bar')).toEqual(['foo', 'bar']);
  });

  it('drops empty entries and de-dupes', () => {
    expect(normalizeTagInput('#foo, , #foo')).toEqual(['foo']);
  });
});

function makeNote(overrides: Partial<StickyNote>): StickyNote {
  return {
    id: '1',
    content: '',
    color: '#FFF59D',
    tags: [],
    position: { x: 0, y: 0 },
    size: { width: 240, height: 240 },
    alwaysOnTop: true,
    isOpen: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('filterNotes', () => {
  const notes = [
    makeNote({ id: '1', content: 'API 키 저장', tags: ['API키'] }),
    makeNote({ id: '2', content: '장보기 목록', tags: ['깃허브'] }),
  ];

  it('returns all notes for an empty query', () => {
    expect(filterNotes(notes, '')).toEqual(notes);
  });

  it('matches by tag substring, case-insensitively', () => {
    expect(filterNotes(notes, 'api').map((n) => n.id)).toEqual(['1']);
  });

  it('matches by content substring', () => {
    expect(filterNotes(notes, '장보기').map((n) => n.id)).toEqual(['2']);
  });
});

describe('collectAllTags', () => {
  it('returns sorted, de-duplicated tags across notes', () => {
    const notes = [makeNote({ tags: ['b', 'a'] }), makeNote({ tags: ['a', 'c'] })];
    expect(collectAllTags(notes)).toEqual(['a', 'b', 'c']);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test -- noteUtils`
Expected: FAIL — `src/shared/noteUtils.ts`가 없어서 import 에러

- [ ] **Step 4: 최소 구현 작성 (`src/shared/noteUtils.ts`)**

```typescript
import type { StickyNote } from './types';

export function normalizeTagInput(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(/[,\s]+/)) {
    const tag = part.trim().replace(/^#/, '');
    if (tag.length === 0 || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

export function filterNotes(notes: StickyNote[], query: string): StickyNote[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') return notes;
  return notes.filter((note) => {
    const inContent = note.content.toLowerCase().includes(trimmed);
    const inTags = note.tags.some((tag) => tag.toLowerCase().includes(trimmed));
    return inContent || inTags;
  });
}

export function collectAllTags(notes: StickyNote[]): string[] {
  const tagSet = new Set<string>();
  for (const note of notes) {
    for (const tag of note.tags) tagSet.add(tag);
  }
  return [...tagSet].sort((a, b) => a.localeCompare(b));
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- noteUtils`
Expected: PASS (7개 테스트 모두 통과)

- [ ] **Step 6: 커밋**

```bash
git add src/shared/types.ts src/shared/noteUtils.ts tests/noteUtils.test.ts
git commit -m "feat: add shared types and tag/search utilities"
```

---

### Task 3: 로컬 데이터 저장소 (electron-store 래퍼 + 손상 파일 복구) (TDD)

**Files:**
- Create: `src/main/store.ts`
- Test: `tests/store.test.ts`

**Interfaces:**
- Consumes: `StickyNote` (`src/shared/types.ts`)
- Produces: `createNoteStore(cwd: string): NoteStore`, `NoteStore` 타입 (`getAllNotes`, `createNote`,
  `updateNote`, `deleteNote`) — Task 4가 사용

- [ ] **Step 1: 실패하는 테스트 작성 (`tests/store.test.ts`)**

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
    expect(store.getAllNotes()).toHaveLength(1);
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
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- store`
Expected: FAIL — `src/main/store.ts`가 없어서 import 에러

- [ ] **Step 3: 구현 작성 (`src/main/store.ts`)**

```typescript
import Store from 'electron-store';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { StickyNote } from '../shared/types';

interface NotesSchema {
  notes: StickyNote[];
}

const DEFAULT_SIZE = { width: 240, height: 240 };
const DEFAULT_COLOR = '#FFF59D';

export function createNoteStore(cwd: string) {
  const filePath = path.join(cwd, 'notes.json');
  backupIfCorrupted(filePath);

  const store = new Store<NotesSchema>({ name: 'notes', cwd, defaults: { notes: [] } });

  function getAllNotes(): StickyNote[] {
    return store.get('notes');
  }

  function createNote(partial: Partial<StickyNote> = {}): StickyNote {
    const now = Date.now();
    const note: StickyNote = {
      id: randomUUID(),
      content: partial.content ?? '',
      color: partial.color ?? DEFAULT_COLOR,
      tags: partial.tags ?? [],
      position: partial.position ?? { x: 100, y: 100 },
      size: partial.size ?? DEFAULT_SIZE,
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

  return { getAllNotes, createNote, updateNote, deleteNote };
}

function backupIfCorrupted(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  try {
    JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    fs.copyFileSync(filePath, `${filePath}.bak`);
    fs.rmSync(filePath);
  }
}

export type NoteStore = ReturnType<typeof createNoteStore>;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- store`
Expected: PASS (7개 테스트 모두 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/main/store.ts tests/store.test.ts
git commit -m "feat: add local note store with corrupted-file recovery"
```

---

### Task 4: Main 프로세스 — IPC 브리지 & 윈도우 관리

**Files:**
- Create: `src/main/windows.ts`
- Create: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `NoteStore` (Task 3), `StickyNote`/`NotesAPI`/`IPC_CHANNELS` (Task 2)
- Produces:
  - `createListWindow(): BrowserWindow`
  - `openNoteWindow(store: NoteStore, id: string): void`
  - `restoreOpenNoteWindows(store: NoteStore): void`
  - `setNoteAlwaysOnTop(id: string, value: boolean): void`
  - `createTray(onOpenList: () => void): void`
  - `registerIpcHandlers(store, callbacks): void`
  - `window.notesAPI` (렌더러에서 사용 가능) — Task 5, 6이 사용

이 태스크는 순수 로직이 아니라 Electron 런타임 자체(윈도우/트레이/IPC)를 다루므로 자동화
단위 테스트 대신 devtools를 통한 수동 검증으로 확인한다 (Global Constraints 참고).

- [ ] **Step 1: 윈도우 관리 구현 (`src/main/windows.ts`)**

```typescript
import { BrowserWindow, Tray, Menu, app, nativeImage } from 'electron';
import { join } from 'node:path';
import type { NoteStore } from './store';

// 1x1 투명 PNG. 트레이 아이콘 자리표시자이며, 실제 브랜드 아이콘은 디자인이 정해지면 교체한다.
const TRAY_ICON_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const noteWindows = new Map<string, BrowserWindow>();
let listWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

export function createListWindow(): BrowserWindow {
  if (listWindow) {
    listWindow.show();
    listWindow.focus();
    return listWindow;
  }
  listWindow = new BrowserWindow({
    width: 360,
    height: 600,
    webPreferences: { preload: join(__dirname, '../preload/index.js') },
  });
  loadRendererPage(listWindow, 'list');
  listWindow.on('closed', () => {
    listWindow = null;
  });
  return listWindow;
}

export function openNoteWindow(store: NoteStore, id: string): void {
  const existing = noteWindows.get(id);
  if (existing) {
    existing.show();
    existing.focus();
    return;
  }
  const note = store.getAllNotes().find((n) => n.id === id);
  if (!note) return;

  const win = new BrowserWindow({
    width: note.size.width,
    height: note.size.height,
    x: note.position.x,
    y: note.position.y,
    alwaysOnTop: note.alwaysOnTop,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      additionalArguments: [`--note-id=${id}`],
    },
  });
  loadRendererPage(win, 'note');

  win.on('close', (event) => {
    event.preventDefault();
    win.hide();
    store.updateNote(id, { isOpen: false });
  });
  win.on('closed', () => {
    noteWindows.delete(id);
  });
  win.on('moved', () => {
    const [x, y] = win.getPosition();
    store.updateNote(id, { position: { x, y } });
  });
  win.on('resized', () => {
    const [width, height] = win.getSize();
    store.updateNote(id, { size: { width, height } });
  });

  noteWindows.set(id, win);
  store.updateNote(id, { isOpen: true });
}

export function restoreOpenNoteWindows(store: NoteStore): void {
  for (const note of store.getAllNotes()) {
    if (note.isOpen) openNoteWindow(store, note.id);
  }
}

export function setNoteAlwaysOnTop(id: string, value: boolean): void {
  noteWindows.get(id)?.setAlwaysOnTop(value);
}

export function createTray(onOpenList: () => void): void {
  const icon = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_PNG_BASE64, 'base64'));
  tray = new Tray(icon);
  tray.setToolTip('스티커 메모');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '메모 목록 열기', click: onOpenList },
      { label: '종료', click: () => app.quit() },
    ]),
  );
}

function loadRendererPage(win: BrowserWindow, page: 'list' | 'note'): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${page}.html`);
  } else {
    win.loadFile(join(__dirname, `../renderer/${page}.html`));
  }
}
```

- [ ] **Step 2: IPC 핸들러 구현 (`src/main/ipc.ts`)**

```typescript
import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import type { StickyNote } from '../shared/types';
import type { NoteStore } from './store';

interface WindowCallbacks {
  openNoteWindow: (id: string) => void;
  setNoteAlwaysOnTop: (id: string, value: boolean) => void;
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
      broadcastChanged(store);
      return removed;
    }),
  );

  ipcMain.handle(IPC_CHANNELS.OPEN_WINDOW, (_event, id: string) => {
    callbacks.openNoteWindow(id);
  });
}

function withSaveErrorHandling<T>(event: IpcMainInvokeEvent, fn: () => T): T | null {
  try {
    return fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    event.sender.send(IPC_CHANNELS.SAVE_ERROR, `저장 실패: ${message}`);
    return null;
  }
}

function broadcastChanged(store: NoteStore): void {
  const notes = store.getAllNotes();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.CHANGED, notes);
  }
}
```

- [ ] **Step 3: preload에 notesAPI 노출 (`src/preload/index.ts` 전체 교체)**

```typescript
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import type { NotesAPI, StickyNote } from '../shared/types';

const notesAPI: NotesAPI = {
  getAll: () => ipcRenderer.invoke(IPC_CHANNELS.GET_ALL),
  create: (partial) => ipcRenderer.invoke(IPC_CHANNELS.CREATE, partial),
  update: (id, changes) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE, id, changes),
  remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.DELETE, id),
  openNoteWindow: (id) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_WINDOW, id),
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
};

contextBridge.exposeInMainWorld('notesAPI', notesAPI);

function getNoteId(): string | null {
  const arg = process.argv.find((a) => a.startsWith('--note-id='));
  return arg ? arg.slice('--note-id='.length) : null;
}

contextBridge.exposeInMainWorld('noteId', getNoteId());
```

- [ ] **Step 4: main 엔트리를 전체 배선으로 교체 (`src/main/index.ts` 전체 교체)**

```typescript
import { app, BrowserWindow } from 'electron';
import { createNoteStore } from './store';
import { registerIpcHandlers } from './ipc';
import {
  createListWindow,
  openNoteWindow,
  restoreOpenNoteWindows,
  setNoteAlwaysOnTop,
  createTray,
} from './windows';

app.whenReady().then(() => {
  const store = createNoteStore(app.getPath('userData'));

  registerIpcHandlers(store, {
    openNoteWindow: (id) => openNoteWindow(store, id),
    setNoteAlwaysOnTop,
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

- [ ] **Step 5: 수동 검증**

Run: `npm run dev`
1. 리스트 창이 뜨고, 시스템 트레이에 아이콘이 나타나는지 확인
2. 리스트 창에서 개발자도구(Ctrl/Cmd+Shift+I)를 열고 콘솔에서:
   ```js
   const note = await window.notesAPI.create({ content: 'test' });
   await window.notesAPI.getAll();      // note가 포함된 배열이 반환되는지 확인
   await window.notesAPI.openNoteWindow(note.id);  // 노트 창이 새로 뜨는지 확인
   ```
3. 노트 창을 X로 닫고 → 앱이 종료되지 않고 트레이에 남아있는지 확인
4. 리스트 창 콘솔에서 다시 `window.notesAPI.openNoteWindow(note.id)` 실행 → 같은 노트 창이 다시 뜨는지 확인
5. 앱을 완전히 재시작(`npm run dev` 재실행) → 방금 열어뒀던 노트 창이 자동으로 다시 뜨는지 확인 (isOpen 복원)
6. 트레이 메뉴의 "종료" 클릭 → 앱이 완전히 종료되는지 확인

- [ ] **Step 6: 커밋**

```bash
git add src/main/windows.ts src/main/ipc.ts src/preload/index.ts src/main/index.ts
git commit -m "feat: wire IPC bridge and window management"
```

---

### Task 5: 리스트 창 UI (검색, 태그 필터, 생성, 삭제 확인)

**Files:**
- Modify: `src/renderer/list/ListApp.tsx` (Task 1의 placeholder 교체)
- Create: `src/renderer/list/ListApp.css`

**Interfaces:**
- Consumes: `window.notesAPI` (Task 4), `filterNotes`/`collectAllTags` (Task 2)

- [ ] **Step 1: ListApp 구현**

```tsx
import { useEffect, useMemo, useState } from 'react';
import type { StickyNote } from '../../shared/types';
import { filterNotes, collectAllTags } from '../../shared/noteUtils';
import './ListApp.css';

export function ListApp() {
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    window.notesAPI.getAll().then(setNotes);
    return window.notesAPI.onNotesChanged(setNotes);
  }, []);

  const visibleNotes = useMemo(() => {
    const searched = filterNotes(notes, query);
    return activeTag ? searched.filter((note) => note.tags.includes(activeTag)) : searched;
  }, [notes, query, activeTag]);

  const allTags = useMemo(() => collectAllTags(notes), [notes]);

  async function handleCreate() {
    const note = await window.notesAPI.create({});
    if (note) await window.notesAPI.openNoteWindow(note.id);
  }

  async function handleDelete(id: string) {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    await window.notesAPI.remove(id);
  }

  return (
    <div className="list-app">
      <header className="list-app__header">
        <input
          className="list-app__search"
          placeholder="검색 (텍스트 또는 #태그)"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button onClick={handleCreate}>새 메모</button>
      </header>

      <div className="list-app__tags">
        <button className={activeTag === null ? 'active' : ''} onClick={() => setActiveTag(null)}>
          전체
        </button>
        {allTags.map((tag) => (
          <button
            key={tag}
            className={activeTag === tag ? 'active' : ''}
            onClick={() => setActiveTag(tag === activeTag ? null : tag)}
          >
            #{tag}
          </button>
        ))}
      </div>

      <ul className="list-app__notes">
        {visibleNotes.map((note) => (
          <li key={note.id} style={{ borderLeftColor: note.color }}>
            <button
              className="list-app__note-open"
              onClick={() => window.notesAPI.openNoteWindow(note.id)}
            >
              <span className="list-app__note-content">{note.content || '(빈 메모)'}</span>
              <span className="list-app__note-tags">
                {note.tags.map((tag) => `#${tag}`).join(' ')}
              </span>
            </button>
            <button className="list-app__note-delete" onClick={() => handleDelete(note.id)}>
              삭제
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: 최소 스타일 작성 (`src/renderer/list/ListApp.css`)**

```css
.list-app { display: flex; flex-direction: column; height: 100vh; font-family: sans-serif; }
.list-app__header { display: flex; gap: 8px; padding: 8px; }
.list-app__search { flex: 1; }
.list-app__tags { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 8px 8px; }
.list-app__tags button.active { font-weight: bold; text-decoration: underline; }
.list-app__notes { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
.list-app__notes li { display: flex; border-left: 6px solid; padding: 6px 8px; gap: 8px; }
.list-app__note-open { flex: 1; display: flex; flex-direction: column; align-items: flex-start; text-align: left; }
.list-app__note-content { font-size: 14px; }
.list-app__note-tags { font-size: 12px; color: #666; }
```

- [ ] **Step 3: 수동 검증**

Run: `npm run dev`
1. "새 메모" 클릭 → 리스트에 항목이 추가되고 노트 창이 뜨는지 확인
2. 노트 창에서 텍스트/태그를 넣은 뒤(Task 6 완료 후 가능) 리스트에서 검색창에 텍스트/태그 일부를
   입력해 필터링되는지 확인 (Task 6 이전에는 `window.notesAPI.update(id, {...})`로 devtools에서 대체 확인)
3. 태그 칩 클릭 → 해당 태그를 가진 메모만 보이는지, 다시 클릭하면 해제되는지 확인
4. "삭제" 클릭 → confirm 다이얼로그가 뜨고, 취소하면 삭제되지 않고 확인하면 삭제되는지 확인

- [ ] **Step 4: 커밋**

```bash
git add src/renderer/list/ListApp.tsx src/renderer/list/ListApp.css
git commit -m "feat: build list window UI with tag filter and search"
```

---

### Task 6: 노트 창 UI (텍스트 편집, 자동저장, 색상, 태그, 항상 위) (디바운스는 TDD)

**Files:**
- Create: `src/shared/debounce.ts`
- Test: `tests/debounce.test.ts`
- Modify: `src/renderer/note/NoteApp.tsx` (Task 1의 placeholder 교체)
- Create: `src/renderer/note/NoteApp.css`

**Interfaces:**
- Consumes: `window.notesAPI`, `window.noteId` (Task 4), `normalizeTagInput` (Task 2)
- Produces: `debounce<Args>(fn, delayMs)` — 이후 다른 자동저장 로직에서도 재사용 가능

- [ ] **Step 1: 실패하는 테스트 작성 (`tests/debounce.test.ts`)**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../src/shared/debounce';

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls the function once after the delay, with the last args', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced('a');
    debounced('b');
    debounced('c');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('does not call the function before the delay elapses', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced('a');
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- debounce`
Expected: FAIL — `src/shared/debounce.ts`가 없어서 import 에러

- [ ] **Step 3: 구현 작성 (`src/shared/debounce.ts`)**

```typescript
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- debounce`
Expected: PASS (2개 테스트 모두 통과)

- [ ] **Step 5: NoteApp 구현**

```tsx
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
```

- [ ] **Step 6: 최소 스타일 작성 (`src/renderer/note/NoteApp.css`)**

```css
.note-app { display: flex; flex-direction: column; height: 100vh; font-family: sans-serif; padding: 8px; box-sizing: border-box; }
.note-app__toolbar { display: flex; gap: 6px; margin-bottom: 6px; }
.note-app__swatch { width: 18px; height: 18px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.2); }
.note-app__pin.active { outline: 2px solid #333; }
.note-app__content { flex: 1; resize: none; border: none; background: transparent; font-size: 14px; }
.note-app__tags { border: none; background: rgba(255,255,255,0.6); padding: 4px; }
```

- [ ] **Step 7: 수동 검증**

Run: `npm run dev`
1. 리스트에서 새 메모 생성 → 노트 창에 텍스트 입력 → 약 0.5초 후 리스트 창으로 전환해 내용이
   갱신됐는지 확인 (자동저장 + 브로드캐스트)
2. 색상 스와치 클릭 → 배경색이 바뀌고, 노트 창을 닫았다 리스트에서 다시 열어도 색이 유지되는지 확인
3. 태그 입력창에 `#업무 #급함` 입력 후 포커스 아웃 → 리스트 창 태그 필터에 두 태그가 나타나는지 확인
4. 📌 버튼 토글 → 다른 창(예: 브라우저나 다른 앱) 위로 노트 창이 실제로 항상 떠 있는지/해제 시
   그렇지 않은지 확인

- [ ] **Step 8: 커밋**

```bash
git add src/shared/debounce.ts tests/debounce.test.ts src/renderer/note/NoteApp.tsx src/renderer/note/NoteApp.css
git commit -m "feat: build note window UI with autosave, color, tags, always-on-top"
```

---

### Task 7: 저장 실패 에러 배너

**Files:**
- Modify: `src/renderer/note/NoteApp.tsx`
- Modify: `src/renderer/list/ListApp.tsx`

**Interfaces:**
- Consumes: `window.notesAPI.onSaveError` (Task 4)

- [ ] **Step 1: NoteApp에 배너 상태 추가**

`src/renderer/note/NoteApp.tsx`의 `NoteApp` 함수 상단에 상태와 구독을 추가:

```tsx
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    return window.notesAPI.onSaveError(setSaveError);
  }, []);
```

`return` 블록의 최상단(`<div className="note-app" ...>` 바로 안쪽)에 배너를 추가:

```tsx
      {saveError && (
        <div className="note-app__error-banner">
          {saveError}
          <button onClick={() => setSaveError(null)}>닫기</button>
        </div>
      )}
```

- [ ] **Step 2: ListApp에도 동일한 배너 추가**

`src/renderer/list/ListApp.tsx`의 `ListApp` 함수 상단에:

```tsx
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    return window.notesAPI.onSaveError(setSaveError);
  }, []);
```

`<div className="list-app">` 바로 안쪽에:

```tsx
      {saveError && (
        <div className="list-app__error-banner">
          {saveError}
          <button onClick={() => setSaveError(null)}>닫기</button>
        </div>
      )}
```

- [ ] **Step 3: 배너 스타일 추가**

`ListApp.css`와 `NoteApp.css` 양쪽에 추가:

```css
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

- [ ] **Step 4: 수동 검증 (저장 실패 재현)**

Run: `npm run dev`로 앱을 띄운 상태에서, 별도 터미널로:
```bash
# macOS/Linux 기준 — 앱 실행 후 userData 경로 확인은 devtools 콘솔에서
# require('electron').app.getPath('userData') 대신, 노트 하나 생성 후 아래처럼 파일을 읽기전용으로 만든다
chmod 444 "$(node -e "console.log(require('os').homedir())")"/Library/Application\ Support/sticky-notes/notes.json 2>/dev/null || true
```
1. 위 명령이 플랫폼별 경로 차이로 실패하면, 대신 devtools 콘솔에서 실제 경로를 확인:
   메인 프로세스 로그에 `app.getPath('userData')`를 임시로 `console.log`해 경로를 알아낸 뒤 해당
   `notes.json`을 파일 탐색기에서 읽기 전용으로 변경한다.
2. 노트 창에서 텍스트를 수정 → 약 0.5초 후 배너("저장 실패: ...")가 뜨는지 확인
3. 파일을 다시 쓰기 가능하게 되돌리고, 같은 노트를 다시 수정 → 정상 저장되고 배너가 더 이상
   뜨지 않는지 확인 (기존 배너는 "닫기"로 직접 닫는다)

- [ ] **Step 5: 커밋**

```bash
git add src/renderer/note/NoteApp.tsx src/renderer/list/ListApp.tsx src/renderer/note/NoteApp.css src/renderer/list/ListApp.css
git commit -m "feat: surface save failures as a dismissible banner"
```

---

### Task 8: 패키징 설정 & 최종 수동 QA

**Files:**
- Create: `electron-builder.yml`

**Interfaces:**
- Consumes: 전체 앱 (Task 1~7)

- [ ] **Step 1: electron-builder 설정 작성**

```yaml
appId: com.hoduuu.stickynotes
productName: StickyNotes
files:
  - out/**/*
directories:
  buildResources: build
mac:
  target: dmg
  category: public.app-category.productivity
win:
  target: nsis
linux:
  target: AppImage
  category: Utility
```

- [ ] **Step 2: 빌드 검증**

Run: `npm run build`
Expected: `out/main`, `out/preload`, `out/renderer`에 결과물이 생성되고 에러 없이 종료

- [ ] **Step 3: 타입체크 전체 통과 확인**

Run: `npm run typecheck`
Expected: 에러 없음

- [ ] **Step 4: 전체 테스트 스위트 통과 확인**

Run: `npm test`
Expected: `noteUtils`, `debounce`, `store` 테스트 전부 PASS

- [ ] **Step 5: 최종 수동 QA 체크리스트**

`npm run dev`로 실행하며 아래를 모두 확인:

- [ ] 새 메모 생성 → 텍스트/태그/색상 편집 → 리스트에 실시간 반영
- [ ] 노트 창 X로 닫기 → 데이터 유지, 리스트에서 재오픈 가능
- [ ] 리스트에서 삭제 → 확인 다이얼로그 → 확인 시에만 삭제, 열려 있으면 창도 닫힘
- [ ] 앱 재시작 → 마지막에 열려 있던 노트 창들이 자동으로 다시 뜸
- [ ] 트레이 아이콘 → "메모 목록 열기"로 리스트 창 복구, "종료"로 앱 종료
- [ ] 태그 검색/필터가 텍스트 검색과 함께 정상 동작
- [ ] 저장 실패 시 배너가 뜨고 "닫기"로 닫힘 (Task 7에서 이미 검증)
- [ ] (가능하다면) macOS, Windows 각 1회 이상 실행해 창 동작에 플랫폼 차이가 없는지 확인

- [ ] **Step 6: 커밋**

```bash
git add electron-builder.yml
git commit -m "chore: add packaging config"
```
