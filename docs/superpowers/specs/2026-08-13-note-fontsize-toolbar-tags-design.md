# 노트/리스트 창 UI 5차 개편 (메모별 글씨 크기, 툴바 확대, 태그/압정 다듬기)

## 배경

지난 라운드(`2026-08-13-window-chrome-tag-colors-design.md`)에서 두 창을 프레임리스로 바꾸고, 노트별로 다르게 쓰던 폰트 설정을 앱 전역 설정(`AppSettings`) 하나로 통합했다. 실제로 앱을 써보니 몇 가지가 불편했다:

- 노트 창 툴바가 너무 좁고 아이콘이 작다.
- 글씨 크기를 다시 메모마다 다르게 줄 수 있으면 좋겠다(단, 글씨체 선택 기능은 필요 없다). 대신 리스트 창 자체의 표시 크기는 메모 내용과 별개로 조절하고 싶다.
- 새 메모가 기본으로 "항상 위에 고정"되어 있는 게 거슬리고, 압정 아이콘 위치도 바꾸고 싶다.
- 태그 입력창 문구, 빈 메모 처리, 리스트 카드의 태그 표시 방식 등을 다듬고 싶다.

## 요구사항

### 1. 데이터 모델

- `StickyNote`에 `fontSize: number`를 다시 추가한다(메모마다 다른 값을 가질 수 있음). 값은 `15 | 18 | 21`, 기본값 `18`.
- `AppSettings`에서 `fontFamily` 필드를 삭제한다. `fontSize` 필드는 `listFontSize`로 이름을 바꾸고, "리스트 창 자체(검색창, 카드 내용 등)의 표시 글자 크기"라는 의미로 재정의한다. 값은 `15 | 18 | 21`, 기본값 `18`.
- `src/shared/fonts.ts`: `FONT_FAMILIES` 상수를 삭제한다. `FONT_SIZES`를 `[15, 18, 21]`로 바꾼다.
- `src/main/store.ts`: `DEFAULT_FONT_FAMILY` 상수를 삭제하고 `DEFAULT_FONT_SIZE`를 `18`로 바꾼다. `createNote`에서 `fontSize: partial.fontSize ?? DEFAULT_FONT_SIZE`를 복원한다. `updateSettings`의 검증 로직에서 `fontFamily` 분기를 제거하고 `listFontSize`(값이 `FONT_SIZES`에 속하는지)만 검증한다.
- 이후 노트 본문의 글자 크기는 항상 그 메모 자신의 `note.fontSize`를 쓰고, 리스트 창의 표시 크기는 `settings.listFontSize`를 쓴다 — 서로 독립적인 값이다.

### 2. 노트 창 UI

- 툴바 여백/아이콘을 키운다: 툴바 `padding` `5px 6px` → `10px 12px`. 아이콘 버튼(메뉴/압정/닫기/신규 설정) `22px` → `28px`(내부 SVG `16px`→`20px`). 색상 스와치 `15px` → `18px`.
- 툴바 구성을 좌→우로 바꾼다: **📌(압정)** → 색상 스와치 5개 → (빈 공간) → **☰(메뉴)** → **⚙(설정, 신규)** → **×(닫기)**. 압정 버튼은 기존 우측 그룹(`note-app__toolbar-actions`)에서 빠져 좌측 그룹(`note-app__toolbar-group`)의 맨 앞, 색상 스와치보다도 앞으로 옮긴다.
- ⚙ 버튼을 새로 추가한다. 클릭하면 팝오버가 열리고, 그 안에 "작게/중간/크게" 3개 버튼이 태그 pill과 같은 둥근 모양으로 가로 배열되어 각각 15px/18px/21px에 대응한다. 클릭하면 그 메모의 `fontSize`가 즉시 바뀌어 저장되고, 팝오버는 열린 채로 유지된다(바깥 클릭·Esc로 닫힘 — 기존 설정 팝오버와 동일 패턴).
- 본문 `<textarea>`의 스타일은 전역 `settings`가 아니라 `note.fontSize`를 쓴다. `fontFamily`는 항상 `sans-serif` 고정(선택 UI 없음).
- 태그 입력창의 `placeholder`를 `"태그 입력"`에서 `"#태그"`로 바꾼다. 입력창은 지금처럼 항상 보이고, `+` 버튼 동작도 그대로다.
- 새 메모 생성 시 기본 `alwaysOnTop`을 `true`에서 `false`로 바꾼다.
- 본문(`content`)이 빈 문자열인 채로 노트 창이 닫히면(× 클릭) 그 메모를 삭제한다. 새로 만든 메모든 기존에 있던 메모든 동일하게 적용되고, 태그가 붙어 있어도 본문이 비어 있으면 삭제 대상이다.

### 3. 리스트 창 UI

- `.list-app__titlebar`의 세로 패딩과 버튼 크기를 `.list-app__header`(검색창이 있는 행)와 같은 값(세로 패딩 `8px`, 버튼 `22px`→`28px`)으로 맞춰서 두 영역의 높이가 시각적으로 같아 보이게 한다.
- ⚙ 팝오버를 노트 창과 같은 형태로 바꾼다: 글씨체 섹션은 삭제하고, "작게/중간/크게" 3개 pill 버튼만 가로로 배열한다(15/18/21px). 클릭하면 `notesAPI.updateSettings({ listFontSize })`를 호출한다. 이 값은 리스트 창의 검색창·카드 내용 등 표시 텍스트 크기에만 반영되고, 개별 메모의 본문 폰트에는 영향을 주지 않는다.
- 필터 태그(`.list-app__tags button`): 클릭(토글) 시 진한 배경 + 흰 글자로 바뀌는 기존 동작은 유지하고, 마우스 호버 시에도 카드처럼(`filter: brightness(0.93)`) 살짝 어두워지는 반응을 추가한다.
- 카드 안 태그(`NoteCard.tsx`의 `.list-app__note-tag`)를 필터 태그와 같은 스타일로 통일한다 — `border: 1px solid rgba(0,0,0,0.12)`를 추가하고 `padding`을 필터 태그와 맞춘다(`3px 10px`). `font-size`(`11px`)는 카드 안 태그가 원래 더 작았으므로 그대로 둔다.
- `NoteCard.tsx`의 `MAX_VISIBLE_TAGS`를 `3`에서 `7`로 늘린다("3줄" 체감에 대응하는 근사치, 정확한 줄 수 계산은 하지 않는다). "더보기" 배지 텍스트를 `+N 더보기`에서 `...`로 바꾼다. 클릭 동작(카드 안에서 나머지 태그 펼침)은 그대로 유지한다.

### 4. 변경하지 않는 것

- 태그 추가/삭제, 색상 선택, 검색/필터 로직, 리스트 최신순 정렬, 드래그/리사이즈, 두 창의 프레임리스 구조는 그대로 둔다.
- 압정 아이콘의 모양과 클릭 시 토글되는 동작 자체는 바뀌지 않는다 — 위치와 기본값만 바뀐다.
- `getDarkColor`, `NOTE_COLORS`, 태그 색상 배정 로직(`collectTagColors`)은 변경하지 않는다.

## 구현 메모

- **빈 메모 자동 삭제**는 main 프로세스에서 처리한다. 현재 `CLOSE_WINDOW` IPC 핸들러(`src/main/ipc.ts`)는 `BrowserWindow.fromWebContents(event.sender)?.close()`만 호출하고, 실제 숨김/저장 로직은 `src/main/windows.ts`의 `win.on('close', ...)` 핸들러에 있다. 이 핸들러에서 해당 노트를 `store.getAllNotes()`로 찾아 `content === ''`이면 `store.deleteNote(id)`를 호출하고, `win.hide()`/`persistNoteUpdate(isOpen:false)` 경로 대신 창이 그대로 닫히게 둔다(데이터가 이미 삭제되므로 다음 재시작 때 복원할 것이 없다). 삭제 후에는 리스트 창에도 반영되도록 기존 `broadcastChanged`와 동등한 브로드캐스트를 호출해야 한다.
- 노트 창 ⚙ 팝오버와 리스트 창 ⚙ 팝오버는 시각적으로 거의 동일한 패턴(3개 pill 버튼)이다. 공용 컴포넌트로 뽑을지 각 창에서 따로 구현할지는 구현 계획(plan) 단계에서 정한다 — 이 스펙은 "동일한 시각적 패턴"까지만 요구사항으로 못박는다.
- 이전 라운드의 전역 설정 팝오버(`list-app__settings-popover` 등)는 그대로 재사용하되 글씨체 섹션만 제거한다.

## 테스트

- `npm run typecheck`, `npm test`, `npm run build`로 회귀를 확인한다.
- `StickyNote`에 `fontSize`가 다시 추가되므로 `tests/noteUtils.test.ts`의 `makeNote` 헬퍼에 `fontSize: 18`을 추가한다.
- `AppSettings`의 필드가 `fontFamily`+`fontSize` → `listFontSize`로 바뀌므로 `tests/store.test.ts`의 설정 관련 테스트(기본값, 업데이트, 유효성 검증)를 갱신한다.
- Xvfb + CDP로 두 창을 띄워 다음을 확인한다: 노트 창 툴바가 커졌는지, 압정이 맨 앞으로 왔고 기본이 꺼진 상태인지, ⚙ 클릭 시 3단계 크기 팝오버가 뜨고 선택하면 그 메모만 크기가 바뀌는지(다른 메모나 리스트 창 표시 크기는 그대로인지), 태그 입력창 placeholder가 "#태그"인지, 빈 메모를 열고 아무것도 안 쓴 채 닫으면 리스트에서 사라지는지, 리스트 창 타이틀바 높이가 검색 헤더와 맞는지, 리스트 ⚙로 리스트 표시 크기만 바뀌고 메모 본문엔 영향이 없는지, 필터 태그의 호버/토글 반응, 카드 태그가 7개를 넘으면 "..."로 접히고 클릭 시 펼쳐지는지.
