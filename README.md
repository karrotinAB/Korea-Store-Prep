# 국내 POG (Korea Store Prep)

아트박스 국내 매장용 도면·POG 사이트. Global Opening Prep에서 영어 번역·바이어·집기도면·초도 계산을 빼고,
**POG를 매장마다 팀별로** 만들고 **피드백 POG(MD 메모)** 를 더한 버전이에요.

- 1. 도면: 도면 업로드(VMD) · 온라인 도면
- 2. POG: POG 만들기(POG팀) · 온라인 POG · 피드백 POG(MD)
- 3. 제품 찾기 (바코드 → 그 매장 모든 팀 POG에서 위치)
- 매장 등록 · 용어 사전(POG 입력칸 선택지) · 바코드 등록 · 계정 관리 (관리자)

빌드 없이 파일만 올리면 되는 정적 사이트예요 (`index.html`, `app.js`, `style.css`, `pog-grab.js`, `img/`).

---

## 처음 설정 순서 (Firebase 새로 만들기)

Global Opening Prep와 **데이터가 섞이지 않게 Firebase 프로젝트를 새로** 만들어요. (계정도 따로예요)

### 1. Firebase 프로젝트 만들기
1. https://console.firebase.google.com 접속 → **프로젝트 추가**
2. 이름 예: `korea-store-prep` → Google 애널리틱스는 꺼도 돼요 → 만들기

### 2. 웹 앱 등록 → 설정값을 app.js에 넣기
1. 프로젝트 첫 화면에서 **웹(`</>`) 아이콘** → 앱 이름(예: 국내 POG) → 등록 (Hosting 체크는 안 해도 돼요)
2. 화면에 나오는 `const firebaseConfig = { ... }` 안의 값 6개를 복사
3. `app.js` 맨 위의 `firebaseConfig`(★ 표시)에 그대로 붙여넣기
   (나중에 다시 보려면: ⚙ 프로젝트 설정 → 일반 → 내 앱)

### 3. 로그인(Authentication) 켜기
1. 왼쪽 메뉴 **빌드 → Authentication → 시작하기**
2. 로그인 방법 탭 → **이메일/비밀번호** → 사용 설정 → 저장
3. **설정** 탭 → 사용자 작업 → **'만들기(가입) 사용 설정'이 켜져 있는지** 확인 (계정 관리 화면에서 계정을 만들 때 필요)
4. **설정** 탭 → 승인된 도메인 → **도메인 추가** → `karrotinab.github.io`

### 4. Firestore(데이터베이스) 만들기
1. **빌드 → Firestore Database → 데이터베이스 만들기**
2. 위치: **asia-northeast3 (서울)** → 프로덕션 모드로 시작
3. **규칙** 탭 → 내용을 모두 지우고 `firestore.rules` 파일 내용을 붙여넣기 → **게시**

### 5. Storage(도면 파일·사진) 만들기
1. 요금제를 **Blaze(종량제)** 로 바꿔야 Storage를 쓸 수 있어요 (왼쪽 아래 '업그레이드'. 지금 쓰는 양이면 거의 무료 범위)
2. **빌드 → Storage → 시작하기** → 위치는 기본값 그대로
3. **규칙** 탭 → `storage.rules` 내용을 붙여넣기 → **게시**
   (Firestore 접근 권한을 허용할지 묻는 창이 뜨면 **허용**)

### 6. 첫 관리자 계정 만들기 (콘솔에서 한 번만)
1. **Authentication → 사용자 → 사용자 추가** → 내 이메일·비밀번호
2. **Firestore Database → 데이터 → 컬렉션 시작**
   - 컬렉션 ID: `roles`
   - 문서 ID: 내 이메일 (**소문자로**)
   - 필드: `level` (string) = `admin`, `name` (string) = 내 이름
3. 그 다음부터는 사이트 오른쪽 위 **계정 관리**에서 계정을 만들어요 (처음 비밀번호 `123456`)

### 7. GitHub Pages로 올리기
1. 이 저장소(`karrotinAB/Korea-Store-Prep`)에 파일 올리기
2. 저장소 **Settings → Pages** → Source: `Deploy from a branch` → Branch: `main` / `(root)` → Save
3. 1~2분 뒤 `https://karrotinab.github.io/korea-store-prep/` 로 접속

> **규칙 게시가 먼저, 사이트 배포는 그다음.** 'Missing or insufficient permissions' 오류 = 규칙이 게시되지 않았거나 레벨이 없는 계정이에요.
> `app.js`·`style.css`를 고치면 `index.html`의 `?v=` 숫자도 바꿔주세요 (브라우저가 예전 파일을 쓰지 않게).

---

## 계정 레벨

| 레벨 | 할 수 있는 것 |
|---|---|
| 관리자 | 모든 편집 + 매장 등록·바코드·용어 사전 고치기·계정 관리 |
| POG팀 | POG 만들기 편집, 피드백 '반영함' 표시, 용어 사전에 새 이름 넣기 (나머지는 보기) |
| VMD팀 | 도면 편집 (나머지는 보기) |
| MD | 피드백 POG에 메모 남기기 (나머지는 보기) |
| 제품 찾기만 | 제품 찾기만 (매장 계정, 최종 POG만) |

## 팀별 POG 가져오기
1. POG 만들기 → **+ 새 POG 가져오기** → 창 안의 '📥 POG 가져오기' 버튼을 북마크바로 끌어다 놓기 (처음 한 번)
2. POG 사이트 매장 매대 목록 화면에서 북마크 누르기 → **팀 고르기 창**에서 가져올 팀 체크 → '고른 팀 가져오기'
3. 다 읽으면 '복사하기' → 사이트 창에 붙여넣기 → **팀마다 POG가 하나씩** 생겨요 (예: 강남점 · 디자인지제)
- 매대를 체크해 두면 체크한 매대만 읽어요. 같은 매장·같은 팀 POG가 이미 있으면 한 번 더 물어봐요.
- 이미 있는 POG를 최신으로 바꾸려면 그 POG를 열고 **↻ 다시 가져오기**.
