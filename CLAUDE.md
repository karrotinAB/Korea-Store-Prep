# 국내 POG (Korea Store Prep) — 개발 인수인계

아트박스 국내 매장용 도면·POG 사이트. **Global Opening Prep(karrotinAB/Global-Opening-Prep)를 복사해서 만든 국내판**이다.
두 사이트는 따로 운영한다 — **이 작업을 Global Opening Prep 저장소에 올리면 안 된다 (사용자).**
원본의 기능 설명(매대 칸 나누기, 매대 밖 제품, 매대 나누기·묶음, 메모, 되돌리기, 수정 기록, 도면 업로드·저장 구역·번호, 제품 찾기 등)은
Global Opening Prep의 CLAUDE.md 8장을 보면 된다. 여기서는 **국내판에서 달라진 것**만 적는다.

## 1. 원본에서 뺀 것
- 영어 번역 전부: 도면 번역(`dw-tr`), POG 번역(`pog-trans`), `translations` 하위 컬렉션, 언어 알약, 사이트 글자 언어(i18n), 영문 도면 바탕(base SVG)
- 바이어 레벨·매장코드 앞 4자리(`storePrefix`, `prefix`)
- 글로벌사업부 레벨, 예전 `editor` 레벨
- 집기도면(편집·번역·온라인), 초도 계산(POG 계산기 연결 `calc`), 수출서류 사이트 권한(`ex`)
- 집기·고리·매대 등록의 English·추가 언어 열, '카테고리'·'팀명' 분류 → 사전은 **POG 입력칸 선택지(한국어)** 로만 씀 (매대타입·고리타입·선반/파이프·집기)

## 2. 계정 레벨 (사용자)
보기는 직원 모두. 편집은 각자 맡은 것만.

| level | 이름 | 편집 |
|---|---|---|
| `admin` | 관리자 | 전부 + 매장 등록·바코드·집기·고리·매대 등록 고치기·계정 관리 |
| `pog` | POG팀 | POG 만들기, 피드백 '반영함' 표시, 집기·고리·매대 등록 새 이름 넣기·제작필요 체크 |
| `vmd` | VMD팀 | 도면 |
| `md` | MD | 피드백 POG 메모 |
| `finder` | 제품 찾기만 | 없음 (매장 계정, 최종본만 읽음) |
| `none` / `blocked` | 권한 없음 / 접속 막힘 | 아무것도 못 봄 |

앱: `ACCESS` 표(app.js 맨 위). 진짜 차단은 `firestore.rules`·`storage.rules`.

## 3. 팀별 POG (사용자: 국내는 매장당 팀별로 POG가 필요, 한 번에 다 불러오면 오래 걸림)
- **POG 문서 하나 = 매장 하나의 팀 하나.** `pogs/{id}.team`(번호 뗀 팀명, 예: 디자인지제) · `teamName`(POG 사이트 원래 팀명, 예: 01 디자인지제)
- `pogTeam(p)`, `pogStore(p)`, `pogTitle(p)` = '강남점 · 디자인지제'. 표지 가운데 'POG' 자리에 '{팀} POG'(`syncCover`), 썸네일 표지도.
- **북마클릿(`pog-grab.js`)**: 매대 목록 화면에서 체크한 매대가 없으면 **팀 고르기 창**(`pickTeams`, 팀마다 매대 수) → 고른 팀 매대만 읽음. '전체 가져오기'도 있음. 체크한 매대가 있으면 그것만. 결과 표에 팀 열.
  (원본의 POG 계산기 상품 정보 모드는 뺐음)
- **가져오기(`doImport`)**: 붙여넣은 데이터를 팀명으로 나눠 **팀마다 POG를 하나씩** 만듦. 같은 매장(storeCode)·같은 팀 POG가 이미 있으면 확인 창.
- **다시 가져오기**: 다른 팀 매대가 섞이면 경고(`teamWarn`).
- **POG 목록**(만들기·온라인·피드백): 매장마다 머리줄(`.pstore`) + 팀 POG(`.pitem-team`, POG 사이트 팀 번호 순) — `groupedPogList`, 찾기는 `pogMatch`(매장·팀·담당자).
- **도면 매대 고르기(`openHeaderPicker`)**: 같은 매장의 다른 팀 POG에 연결된 매대는 보라 점선(`.dw-box.other-team`, 마우스를 올리면 팀 이름).
- **도면 찾기(`loadDwFindPog`)**: 그 매장의 팀별 최종 POG(팀마다 가장 최근)를 모두 읽음.
- **제품 찾기**: 매장 카드 = 매장코드마다(팀 n개). 그 매장 팀별 최종 POG를 모두 읽어서(`fdOpen`, 페이지마다 `_pog`) 찾음. 결과 위치 줄에 팀 이름.

## 4. 피드백 POG (MD · 사용자)
- POG 메뉴 아래 탭 '피드백 POG'(`pog-fb`, 화면 `#v-pog-fb`) + POG 화면 타일. POG 만들기 툴바 '💬 피드백'으로도 그 POG 피드백 화면으로 감.
- POG(작성 중·최종 모두)를 보기 전용으로 띄우고, 왼쪽 썸네일·페이지를 누르면 그 페이지가 '지금 페이지'(보라 테두리) → 오른쪽에서 **메모 남기기**(Ctrl+Enter).
- 저장: `pogs/{pogId}/feedback/{id}` = `{ fx(페이지 id, 표지 '__cover'), page(남길 때 페이지 이름), text, by, byName, at, done, doneBy, doneByName, doneAt }`
- 페이지·썸네일 오른쪽 위 '💬 n'(반영 안 된 개수, 다 반영하면 초록 ✓). 오른쪽 패널: 이 페이지 피드백 + 다른 페이지의 반영 안 된 피드백(누르면 그 페이지로).
- 쓰기 = MD·관리자 (`pog-fb`), '✓ 반영함' = POG팀·관리자, 삭제 = 쓴 사람·관리자. 규칙도 같음. POG를 지우면 피드백도 지움.
- **다음 할 것 (사용자):** 그림 그리기(펜·화살표·동그라미)와 메모를 페이지 위에 쉽게. 지금은 글 메모까지만.
- 코드: `fb`, `openFb`, `renderFbPages`, `renderFbSide`, `paintFbCounts`, `fbNoteCard`, `fbDone`, `fbDelete` (app.js '2.3 피드백 POG').

## 5. Firebase
- **새 프로젝트** (Global Opening Prep와 데이터·계정 분리). 설정값은 `app.js` 맨 위 `firebaseConfig`, 비어 있으면(`여기에-…`) 로그인 화면에 안내 글(`FB_READY`).
- 설정 순서는 README.md. 규칙을 바꾸면 Firebase 에뮬레이터로 확인할 것.
- Firestore: `roles`, `stores`, `drawings`(+`versions`·`seq`·`logs`), `pogs`(+`fixtures`·`logs`·`feedback`), `glossary`, `glossaryLog`, `barcodes`, `managers`.

## 6. 작업 원칙 (원본과 같음)
- 화면 문구·대화는 **한국어**, 쉽게. 사용자는 개발자가 아님.
- 빌드 도구 없음 (HTML + CSS + 바닐라 JS 모듈). Firebase SDK 10.12.2 gstatic CDN.
- **`app.js`·`style.css`를 고치면 `index.html`의 `?v=`를 둘 다 바꿀 것. `app.js` 맨 위 `APP_VER`도 같은 값으로** (화면 맨 아래 'ver …'로 보임 → 사용자가 예전 파일을 쓰는지 확인).
- **작업이 끝나면 작업 브랜치에 올린 뒤 바로 기본 브랜치(`claude/magical-turing-fm2xe8`, 이 저장소에는 `main`이 없음)에도 합쳐서 올릴 것** (사용자). PR은 만들지 않음.
- PC는 `html { zoom: .8 }` → 끄는 기능은 `ZM()`/`ZP()`로 나눌 것. 화면 높이는 `var(--vh)`·`var(--top)`.

## 7. 메뉴·도면 화면 (사용자)
- PC는 메뉴가 왼쪽 세로 막대(`#nav`, 휴대폰은 위쪽 가로). '2. POG'를 누르면 POG 메뉴+하위만(`grp-pog`).
- **도면은 한 메뉴 '1. 도면'(`dw-online`)**: 보기 화면 안의 '📤 도면 업로드'(`dw-goup`, 도면 편집 계정만) → `dw-up`(편집), '← 도면 보기'(`dw-goon`)로 돌아옴. 도면 편집 계정은 보기 목록에 모든 매장이 나옴.

- **도면 팀별 보기 (사용자, 방법1: 도면은 매장마다 하나)**: 툴바 '팀:'(`#dw-team`, `dw.team`). 매대 팀 = 업로드 화면에서 직접 정한 `groups[].team` → 없으면 그 팀 POG와 연결된 매대(`loadDwTeams`, `teamOfG`). 다른 팀 매대는 흐리게(`.dw-team.dim`). 번호는 팀마다 `seq/{버전id}__{팀}`(`seqId`), POG는 `readSeq(…, pogTeam)`로 자기 팀 번호 먼저. 업로드 화면 오른쪽 '매대 팀 정하기'.

## 8. 매장 등록 (사용자)
- 칸은 **지점코드 · 지점명 · 오픈 예정일**만 (파트너 이름 칸은 없앰). 문서 필드는 `code`·`branch`·`openDate` 그대로.
- 지점코드 = POG 사이트 매장코드 (POG `storeCode`와 같아야 POG·도면이 이어짐).
- 화면에 보이는 매장 이름 = 지점명(`storeName`). 예전 데이터에 `partner`만 있으면 그것.
