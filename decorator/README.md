# 나만의 꾸미기 (Image Decorator)

배경 / 캐릭터 / 소품 이미지를 골라서 자유롭게 배치하고, 텍스트를 꾸며서 나만의 이미지를 만들고 PNG로 저장하는 정적 웹앱입니다. 빌드 과정이 필요 없는 순수 HTML/CSS/JS라 Cloudflare Pages에 그대로 올릴 수 있습니다.

## 기능

- 배경 선택 (바다 / 산 / 노을 / 밤하늘 / 도시 / 눈밭 + 내 이미지 업로드)
- 캐릭터 배치 (물고기 / 고양이 / 곰 / 새 / 토끼 / 강아지 / 문어 + 내 이미지 업로드)
- 소품 배치 (나무 / 집 / 해 / 구름 / 풍선 / 별 / 꽃 / 하트 + 내 이미지 업로드)
- 드래그로 이동, 모서리 손잡이로 크기 조절, 좌우반전
- 텍스트 추가: 폰트, 색상, 크기 조절, 드래그로 이동
- 레이어 맨 앞/뒤로 보내기, 삭제
- 완성한 이미지를 PNG로 다운로드

업로드한 이미지는 브라우저 안에서만 사용되며 어디에도 전송되지 않습니다(서버가 없는 정적 사이트입니다).

## 로컬에서 실행

빌드가 필요 없으므로 정적 파일 서버로 `decorator` 폴더만 열면 됩니다.

```bash
cd decorator
python3 -m http.server 8080
# 브라우저에서 http://localhost:8080 접속
```

## Cloudflare Pages로 배포하기

### 방법 A — 대시보드에서 GitHub 연동 (가장 쉬움)

1. https://dash.cloudflare.com 접속 → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. 이 저장소(`hoduuu/hoduuu`)를 선택하고 배포할 브랜치를 고릅니다.
3. 빌드 설정:
   - **Build command**: 비워둠 (빌드 불필요)
   - **Build output directory**: `decorator`
4. **Save and Deploy**를 누르면 `*.pages.dev` 주소가 발급되고, 이후 해당 브랜치에 푸시할 때마다 자동으로 재배포됩니다.

### 방법 B — Wrangler CLI로 직접 배포

```bash
npm install -g wrangler
wrangler login
cd decorator
wrangler pages deploy . --project-name my-decoration
```

배포가 끝나면 `https://my-decoration.pages.dev` 형태의 주소가 생성되며, 이 링크를 다른 사람과 공유하면 누구나 접속해서 사용할 수 있습니다.

## 나만의 이미지/배경 추가하기

`assets/backgrounds`, `assets/characters`, `assets/props` 폴더에 PNG/SVG 파일을 추가한 뒤 `app.js` 상단의 `ASSETS` 객체에 `{ name, src }` 항목을 추가하면 갤러리에 기본 제공 이미지로 노출됩니다. (배경 이미지를 SVG로 만들 경우 `<svg>` 루트에 `width`/`height`를 반드시 명시해야 PNG 내보내기 시 캔버스에 정상적으로 그려집니다.)
