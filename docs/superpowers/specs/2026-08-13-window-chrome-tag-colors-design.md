# 노트/리스트 창 프레임리스 전환 & 태그 색상 개편

## 배경

지금까지 노트 창(`src/renderer/note/NoteApp.tsx`)과 리스트 창(`src/renderer/list/ListApp.tsx`)은 OS 네이티브 타이틀바를 그대로 쓰고 있다. 사용자가 두 창 모두에서 네이티브 타이틀바를 없애고, 각 창에 맞는 커스텀 상단 UI(아이콘 버튼들)로 대체하기로 결정했다. 이 과정에서 노트 창의 폰트 편집 기능(Aa 팝오버)은 삭제하고, 대신 리스트 창에 앱 전역 폰트 설정을 추가한다. 또한 태그 색상 체계를 다듬고, 리스트 창의 카드 정렬/태그 표시 방식도 함께 개선한다.

## 요구사항

### 1. 노트 창 — 프레임리스 + 툴바 재구성

- `src/main/windows.ts`의 `openNoteWindow`에서 생성하는 `BrowserWindow`에 `frame: false`를 추가한다. `autoHideMenuBar`/`setMenuBarVisibility(false)` 호출은 프레임이 없으면 의미가 없으므로 제거한다.
- `resizable`은 별도 설정 없이 기본값(`true`)을 유지해 가장자리 드래그 리사이즈가 계속 동작하게 한다.
- `NoteApp.css`의 `.note-app__toolbar`에 `-webkit-app-region: drag`를 적용해 툴바 빈 공간을 끌면 창이 이동하게 한다. 툴바 안의 모든 버튼(스와치, 메뉴, 압정, 닫기)에는 `-webkit-app-region: no-drag`를 적용해 클릭이 드래그로 먹히지 않게 한다.
- 툴바 구성을 다음과 같이 바꾼다:
  - 좌측: 기존 색상 스와치 5개, 변경 없음.
  - **글씨체/크기 Aa 버튼과 팝오버(`note-app__font-widget`, `note-app__font-toggle`, `note-app__font-popover` 등 관련 state/핸들러/CSS 전부)를 삭제**한다.
  - 우측 고정 그룹(항상 표시, 줄바꿈 대상 아님), 좌→우 순서:
    1. **☰ 메뉴 아이콘** — 클릭 시 리스트 창을 연다(이미 열려 있으면 포커스). 기존 `always visible` 결정에 따라 리스트 창이 열려 있어도 계속 보인다.
    2. **📌 압정 아이콘** — 기존 `alwaysOnTop` 토글, 동작/모양 변경 없음.
    3. **× 닫기 아이콘** — 클릭 시 `window.close()`를 호출한다. 메인 프로세스의 기존 `win.on('close', ...)` 핸들러(이미 `preventDefault` + `hide()` + `isOpen:false` 저장 로직 보유)가 그대로 가로채므로 새 IPC 채널은 필요 없다.
- ☰ 메뉴 아이콘은 새 IPC로 리스트 창을 연다: `IPC_CHANNELS.OPEN_LIST`(`notes:openList`) 채널을 추가하고, `notesAPI.openListWindow()`를 노출한다. 메인 프로세스는 `registerIpcHandlers`의 `WindowCallbacks`에 `openListWindow: () => void`를 추가하고, `index.ts`에서 `openListWindow: () => createListWindow()`로 연결한다.

### 2. 태그 색상 시스템 (노트 창 + 리스트 창 공통)

- 기존 노트 파스텔 색상 5종(`#FFF59D` 노랑, `#FFCCBC` 핑크, `#C8E6C9` 초록, `#B3E5FC` 파랑, `#E1BEE7` 보라)마다 대응하는 "진한" 버전을 정의한다. 새 공용 모듈 `src/shared/noteColors.ts`에 다음을 둔다:
  - `NOTE_COLORS: { light: string; dark: string }[]` — 5개 색상 쌍 (예: 노랑 `#FFF59D`→`#8D6E00`, 핑크 `#FFCCBC`→`#AD1457`, 초록 `#C8E6C9`→`#2E7D32`, 파랑 `#B3E5FC`→`#0277BD`, 보라 `#E1BEE7`→`#6A1B9A`).
  - `getDarkColor(light: string): string` — `light` 값으로 대응하는 `dark`를 찾아 반환, 못 찾으면 `light`를 그대로 반환(방어적 fallback).
- `NoteApp.tsx`의 로컬 `COLORS` 상수를 지우고 `NOTE_COLORS.map(c => c.light)`를 사용하도록 바꾼다.
- 태그의 색 배정은 기존 `collectTagColors`(그 태그를 가진 첫 노트의 `color` 값, 즉 파스텔 5색 중 하나) 로직을 그대로 재사용한다 — 변경 없음.
- **노트 창 태그 pill**(`.note-app__tag-pill`): 배경은 그대로 두고, 글자 색을 해당 노트 색상의 `getDarkColor()` 값으로 지정한다.
- **리스트 창 필터 태그**(`.list-app__tags button`): 평소엔 지금처럼 파스텔 배경 + 검은 글자. `active`(토글 선택) 상태일 때는 배경을 `getDarkColor()` 값으로, 글자는 흰색으로 바꾼다.
- **리스트 카드 안 태그**(`.list-app__note-tag`): 현재 `note.color`(카드 배경과 동일)를 배경으로 써서 잘 안 보이던 문제를 고친다 — `tagColors[tag]`(파스텔)를 배경으로, `getDarkColor()`를 글자색으로 바꾼다.

### 3. 리스트 창 — 프레임리스 + 커스텀 상단바 + 전역 폰트 설정

- `createListWindow`의 `BrowserWindow`에도 `frame: false`를 추가하고, `autoHideMenuBar`/`setMenuBarVisibility(false)` 호출을 제거한다(1번과 동일한 이유).
- `ListApp.tsx`의 기존 검색/+ 헤더(`list-app__header`) 위에 얇은 커스텀 타이틀바 한 줄(`list-app__titlebar`)을 추가한다:
  - 빈 공간은 `-webkit-app-region: drag`로 창 이동에 사용.
  - 우측에 두 아이콘을 순서대로 고정 배치: **⚙(설정)** → **×(닫기)**. 둘 다 `no-drag`.
  - × 닫기는 노트 창과 동일하게 `window.close()`만 호출(리스트 창은 기존에 `close` 이벤트를 가로채지 않으므로 지금과 동일하게 창이 파괴되고 `listWindow = null`이 된다 — 동작 변경 없음, 트리거만 네이티브→커스텀 버튼으로 바뀜).
- ⚙ 클릭 시 작은 팝오버(`list-app__settings-popover`)가 열려 글씨체 4종 / 크기 5단계 목록을 보여준다. 상호작용은 기존 Aa 팝오버와 동일한 패턴(바깥 클릭·Esc로 닫힘, 옵션 선택 시 즉시 적용하되 팝오버는 유지)을 재사용한다. `FONT_FAMILIES`/`FONT_SIZES` 상수는 기존에 `NoteApp.tsx`에 있던 것을 `src/shared/noteColors.ts`와 별개로 `src/shared/fonts.ts`로 옮겨 양쪽에서 재사용한다.
- **전역 설정으로 전환**: `StickyNote`에서 `fontFamily`/`fontSize` 필드를 제거한다. 대신 새 타입 `AppSettings { fontFamily: string; fontSize: number }`을 추가하고, `src/main/store.ts`에 `settings` 키(기본값 `{ fontFamily: 'sans-serif', fontSize: 14 }`, 기존 `DEFAULT_FONT_FAMILY`/`DEFAULT_FONT_SIZE` 상수를 그대로 재사용)를 저장/조회하는 `getSettings()`/`updateSettings(changes)`를 추가한다. `createNote`에서 `fontFamily`/`fontSize` 관련 라인을 제거한다.
  - 새 IPC 채널: `GET_SETTINGS`(`settings:get`), `UPDATE_SETTINGS`(`settings:update`), `SETTINGS_CHANGED`(`settings:changed`). `UPDATE_SETTINGS` 핸들러는 `store.updateSettings()` 후 모든 창에 `SETTINGS_CHANGED`를 브로드캐스트한다(기존 `broadcastChanged`와 동일한 패턴으로 `broadcastSettingsChanged` 추가).
  - `notesAPI`에 `getSettings()`, `updateSettings(changes)`, `onSettingsChanged(callback)`를 추가한다.
  - `NoteApp.tsx`는 마운트 시 `getSettings()`로 초기값을 읽고 `onSettingsChanged`를 구독해, 본문 `<textarea>`의 `fontFamily`/`fontSize` 스타일을 (기존처럼 `note.fontFamily`/`note.fontSize`가 아니라) 이 전역 설정값으로 렌더링한다. 즉 열려 있는 모든 노트 창이 설정 변경을 즉시 함께 반영한다.

### 4. 리스트 카드 태그 더보기

- `.list-app__note-tags`에서 태그가 3개를 초과하면 4번째부터는 숨기고 "더보기" 버튼(pill과 같은 스타일)을 표시한다.
- "더보기" 클릭 시 카드 내부에서 그대로 펼쳐져 나머지 태그가 다 보이게 한다(펼침 상태는 해당 카드 컴포넌트의 로컬 state로 관리 — 리스트 전체 리렌더링이나 저장할 필요 없는 순수 UI 상태). 접는 기능은 요구되지 않았으므로 만들지 않는다.

### 5. 새 메모 정렬

- `ListApp.tsx`에서 `notes`를 필터링하기 전에 `createdAt` 내림차순으로 정렬한다(최신 생성이 위로). 저장소(`store.ts`)의 배열 순서 자체는 건드리지 않고, 렌더러에서 표시 순서만 정렬한다.

### 6. 변경하지 않는 것

- 노트 색상 선택, 압정(`alwaysOnTop`) 기능, 태그 추가/삭제 인터랙션, 본문 textarea, 검색/필터 로직, 저장 실패 배너는 그대로 둔다.
- 태그 입력창은 지금처럼 "+" 버튼 옆에 항상 보이는 상태를 유지한다(이번 라운드에서 숨김/토글로 바꾸지 않음).
- 글자 굵게/기울임/밑줄/형광펜 등 리치 텍스트 서식 기능은 이번 스펙 범위가 아니다.

## 구현 메모

- `src/shared/noteColors.ts`(신규): `NOTE_COLORS`, `getDarkColor()`.
- `src/shared/fonts.ts`(신규): `FONT_FAMILIES`, `FONT_SIZES` (기존 `NoteApp.tsx` 안에 있던 상수를 이동).
- `src/shared/types.ts`: `StickyNote`에서 `fontFamily`/`fontSize` 제거, `AppSettings` 타입 추가, `IPC_CHANNELS`에 `OPEN_LIST`/`GET_SETTINGS`/`UPDATE_SETTINGS`/`SETTINGS_CHANGED` 추가, `NotesAPI`에 `openListWindow`/`getSettings`/`updateSettings`/`onSettingsChanged` 추가.
- `src/main/store.ts`: `NotesSchema`에 `settings` 키 추가, `createNoteStore`가 `getSettings`/`updateSettings`도 반환하도록 확장. `createNote`에서 폰트 관련 필드 제거.
- `src/main/ipc.ts`: `GET_SETTINGS`/`UPDATE_SETTINGS` 핸들러 추가, `WindowCallbacks`에 `openListWindow` 추가해 `OPEN_LIST` 핸들러에서 호출.
- `src/main/windows.ts`: 두 `BrowserWindow` 생성부에 `frame: false` 추가, `autoHideMenuBar`/`setMenuBarVisibility` 호출 제거.
- `src/main/index.ts`: `registerIpcHandlers` 호출부에 `openListWindow: () => createListWindow()` 콜백 추가.
- `src/preload/index.ts`: `notesAPI`에 새 메서드 4개 추가.
- `src/renderer/note/NoteApp.tsx` / `NoteApp.css`: Aa 관련 코드 삭제, 툴바 우측 그룹(메뉴/압정/닫기) 추가, 전역 설정 구독, 태그 pill 글자색 적용, 드래그 리전 CSS.
- `src/renderer/list/ListApp.tsx` / `ListApp.css`: 커스텀 타이틀바(드래그 리전 + ⚙ + ×) 추가, 설정 팝오버(노트 창 Aa 팝오버와 유사한 구조), 태그 색상/토글 스타일, 카드 태그 더보기(개별 카드를 별도 하위 컴포넌트로 분리하는 편이 로컬 펼침 state를 다루기 깔끔함 — `NoteCard` 컴포넌트로 추출), 최신순 정렬.
- 기존 `noteUtils.ts`의 `collectTagColors`/`collectAllTags`/`filterNotes`는 변경 없이 재사용.

## 테스트

- `npm run typecheck`, `npm test`, `npm run build`로 회귀가 없는지 확인한다. `StickyNote`에서 필드를 제거하므로 기존 테스트 중 `fontFamily`/`fontSize`를 참조하는 부분이 있으면 함께 정리한다.
- Xvfb + CDP로 두 창을 띄워 다음을 스크린샷/동작으로 확인한다:
  - 노트 창: 네이티브 타이틀바가 사라졌는지, 툴바 빈 공간 드래그로 창이 이동하는지, 버튼 클릭이 드래그로 오작동하지 않는지, ☰ 클릭 시 리스트 창이 열리는지, × 클릭 시 창이 숨겨지고 `isOpen:false`로 저장되는지, 가장자리 드래그 리사이즈가 여전히 되는지.
  - 리스트 창: 커스텀 타이틀바 드래그 이동, ⚙ 팝오버 열기/폰트·크기 선택/바깥클릭·Esc 닫힘, 선택한 폰트가 열려 있는 다른 노트 창에도 즉시 반영되는지, × 클릭 시 창이 닫히는지.
  - 태그: 노트 창 태그 pill 글자색, 리스트 필터 태그를 토글했을 때 진한 배경으로 바뀌는지, 카드 안 태그가 4개 이상일 때 "더보기"로 펼쳐지는지.
  - 새 메모를 만들면 리스트 맨 위에 나타나는지.
