# 에이스원비즈니스센터 홈페이지

㈜비즈포럼이 운영하는 에이스원비즈니스센터(영등포 에이스하이테크시티) 홈페이지입니다.

## 구성

```
index.html          # 메인 (공실현황 · 서비스 · 공간안내 · 요금 · 이용절차 · 오시는길 · 문의)
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
| `index.html` 요금표 | 호실별 월 이용료, 보증금, 관리비/부가세 포함 여부, 최소 계약기간 |
| `index.html` 오시는 길 | 지하철역·도보 시간, 주차 안내 |
| 모든 파일 푸터 | 대표자명, 사업자등록번호 (전자상거래법상 표기 의무) |
| `virtual-office.html` | 우편물 수령 방식, 회의실 이용 조건, 필요 서류, 비상주 요금 |
| `privacy.html` | 보유기간, 개인정보 보호책임자, 시행일 |

### 3. Formspree 연결 (문의 폼)

1. [formspree.io](https://formspree.io) 가입 → New Form (수신 메일: bizforum2@naver.com)
2. 발급된 주소를 `index.html` 의 `<form action="https://formspree.io/f/YOUR_FORM_ID">` 에 붙여넣기
3. 첫 제출 시 오는 확인 메일에서 인증

연결 전까지는 제출 시 "폼이 아직 연결되지 않았습니다" 안내가 뜨고 전송되지 않습니다.

### 4. 사진 넣기

`images/` 폴더를 만들고 아래 파일명으로 넣은 뒤, 각 자리의 `.photo-slot` div를
`<img class="room-img" src="images/room-1.jpg" alt="1인실 내부" loading="lazy" />` 로 교체합니다.

```
hero.jpg      대표 사진 (건물 외관 또는 라운지)
room-1~5.jpg  1~5인실 내부
meeting.jpg   회의실
lounge.jpg    라운지
corridor.jpg  복도·출입구
building.jpg  건물 외관
og.jpg        카톡 공유 썸네일 (1200x630) — index.html 의 og:image 주석도 해제
```

### 5. 네이버 플레이스 연결

플레이스 등록 후, `index.html` 오시는 길 섹션과 각 페이지 푸터의
"네이버 플레이스" 링크 `href` 를 실제 플레이스 주소로 교체하세요.
(현재는 주소 검색 결과로 연결되어 있습니다)

## 공실 현황 갱신

`index.html` 의 `#vacancy` 섹션에서:

1. `.vac-date` 의 날짜를 오늘로 변경
2. 호실별 배지 class 변경 — `vac-open`(즉시 입주 가능) / `vac-ask`(문의) / `vac-full`(만실)
3. `#rooms` 섹션 각 카드의 배지도 같이 맞추기

> 갱신할 자신이 없으면 `#vacancy` 섹션을 통째로 지우는 편이 낫습니다.
> 날짜가 오래된 공실 정보는 오히려 신뢰를 깎습니다.

## 보기 / 배포

로컬은 `index.html` 을 브라우저로 열면 됩니다.
배포는 이 폴더의 파일을 호스팅(카페24, 가비아, Netlify, GitHub Pages 등) 루트에 올리면 끝입니다.

## 아직 안 한 것

- 카카오톡 채널 상담 버튼
- 네이버 서치어드바이저 / 구글 서치콘솔 등록
- FAQ 섹션
- 실제 지도 임베드 (현재는 약도 일러스트)
