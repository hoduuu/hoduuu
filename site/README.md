# 에이스원비즈니스센터 홈페이지

㈜비즈포럼이 운영하는 에이스원비즈니스센터(영등포 에이스하이테크시티) 홈페이지입니다.

## 구성

```
index.html          # 메인 (서비스 · 공간안내 · 시설안내 · 요금 · 이용절차 · 오시는길 · 문의)
virtual-office.html # 비상주 서비스 상세
privacy.html        # 개인정보처리방침
styles.css          # 디자인 (색상·모서리는 상단 :root 변수에서 일괄 수정)
script.js           # 모바일 메뉴, 스크롤 효과, 문의 폼 전송
```

메뉴: 시설안내 / 요금안내 / 비상주 서비스 / 오시는 길 / 문의

## 배포 전 반드시 할 일

### 1. noindex 태그 삭제 ★

3개 HTML 파일 상단의 아래 두 줄을 **모두** 지워야 검색에 노출됩니다.

```html
<!-- TODO: 실제 배포 전에 이 noindex 태그 반드시 삭제할 것 ... -->
<meta name="robots" content="noindex, nofollow" />
```

### 2. 노란색으로 표시된 곳 채우기

`<span class="todo">OO</span>` 로 감싼 부분이 화면에서 **노란 형광펜**으로 보입니다.
실제 값을 넣고 `<span class="todo">` 태그를 지우면 강조가 사라집니다.

| 위치 | 채울 내용 |
|---|---|
| `index.html` 요금표 | 사무실 보증금, 최소 계약기간 (호실별 임대료·비상주·회의실 요금은 이미 반영됨) |
| `index.html` 오시는 길 | 지하철역·도보 시간, 주차 안내 |
| 모든 파일 푸터 | 대표자명, 사업자등록번호 (전자상거래법상 표기 의무) |
| `virtual-office.html` | 우편물 수령 방식, 회의실 이용 조건, 필요 서류, 처리 소요일 |
| `privacy.html` | 보유기간, 개인정보 보호책임자, 시행일 |

### 3. Formspree 연결 (문의 폼)

1. [formspree.io](https://formspree.io) 가입 → New Form (수신 메일: bizforum2@naver.com)
2. 발급된 주소를 `index.html` 의 `<form action="https://formspree.io/f/YOUR_FORM_ID">` 에 붙여넣기
3. 첫 제출 시 오는 확인 메일에서 인증

연결 전까지는 제출 시 "폼이 아직 연결되지 않았습니다" 안내가 뜨고 전송되지 않습니다.

### 4. 사진 (완료)

공간 안내 / 시설 안내 모두 **카드수첩(가로 스크롤 사진 카드)** 형태입니다.
설명 문장이나 "권장 인원" 같은 텍스트 없이 사진 + 이름표만 보여줍니다.

```
hero.jpg      히어로 배너 (라운지, Ace Business Center 로고 벽면)
room-1.jpg    1인실 카드 (2~5인실은 아직 사진이 없어 placeholder 그대로)
meeting.jpg   회의실 카드 (#facility)
lounge.jpg    라운지 카드 (#facility)
rooftop.jpg   루프탑 테라스 카드 (#facility)
mailroom.jpg  우편함 (virtual-office.html 02번 항목)
```

사진을 바꾸려면 같은 파일명으로 덮어쓰면 됩니다.
2~5인실이나 건물 외관 사진이 생기면, `index.html` 에서 해당 `<figure class="album-card">`
안의 `<div class="album-placeholder">...</div>` 블록을
`<img src="images/room-2.jpg" alt="2인실 내부" loading="lazy" />` 로 바꿔주세요.

### 5. 네이버 플레이스 연결 (완료)

`index.html` 오시는 길 섹션과 각 페이지 푸터의 "네이버 플레이스" 링크가
실제 등록된 플레이스 페이지로 연결되어 있습니다.

## 보기 / 배포

로컬은 `index.html` 을 브라우저로 열면 됩니다.
배포는 이 폴더의 파일을 호스팅(카페24, 가비아, Netlify, GitHub Pages 등) 루트에 올리면 끝입니다.

## 아직 안 한 것

- 카카오톡 채널 상담 버튼
- 네이버 서치어드바이저 / 구글 서치콘솔 등록
- FAQ 섹션
- 실제 지도 임베드 (현재는 약도 일러스트)

## 정보를 한 곳에서만 관리하는 규칙

같은 내용을 두 곳에 적으면 한쪽만 고쳤을 때 사이트에 모순이 생깁니다.
아래는 의도적으로 한 곳에만 둔 항목입니다. 다른 곳에 옮겨 적지 마세요.

| 항목 | 관리 위치 |
|---|---|
| 모든 요금 (사무실·비상주·회의실 포함) | `index.html` `#pricing` 요금표 |
| 시설 목록 | `index.html` `#facility` 섹션 |
| 주소 | `#location` 섹션과 각 페이지 푸터 |

예외로 헤더·푸터는 3개 파일에 같은 내용이 들어 있습니다(정적 사이트 구조상 불가피).
**대표자명·사업자등록번호를 채울 때는 3개 파일을 모두 고쳐야 합니다.**
