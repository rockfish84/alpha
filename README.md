# 더브코 알파 클리닉

출결 · 질문 · 학습 관리 시스템. 학생은 클리닉 출결/질문을 제출하고 이력·통계를
확인하며, 관리자는 채점(과제 O/X·테스트 점수)과 학생/응답을 관리합니다.

- **스택**: Next.js 14 (App Router) · TypeScript · Mongoose/MongoDB · iron-session · bcrypt · recharts
- **배포**: Cloudtype 무료 티어 (web 1 + MongoDB 1)

---

## 로컬 실행

```bash
npm ci
cp .env.example .env      # 값 채우기 (MONGODB_URI, SESSION_SECRET)
npm run seed              # 최초 1회 시드 (관리자·과목·클리닉 날짜·데모 데이터)
npm run dev               # http://localhost:3000
```

기본 계정(시드 후):

| 구분 | 아이디 | 비밀번호 |
|---|---|---|
| 관리자 | `admin` | `admin1234` (`.env` 의 `SEED_ADMIN_PASSWORD`) |
| 학생(데모) | `minjun` / `seoyeon` / `jiho` | `1234` |

> 비밀번호는 모두 **bcrypt 해시**로 저장됩니다. 관리자 화면에서 학생 비밀번호는
> 조회할 수 없고(마스킹), 수정 모달에서 새 값을 입력할 때만 재설정됩니다.

---

## 환경변수

| 변수 | 설명 |
|---|---|
| `MONGODB_URI` | `mongodb://root:비번@db내부호스트:27017/dubco?authSource=admin` |
| `SESSION_SECRET` | iron-session 쿠키 암호화 키 (랜덤 32자 이상) |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` | 시드 관리자 계정 (기본 `admin` / `admin1234`) |
| `NODE_ENV` | `production` |
| `TZ` | `Asia/Seoul` |

---

## Cloudtype 배포

### (1) MongoDB 서비스 먼저 생성
1. 프로젝트 생성 → `+` → 템플릿 **MongoDB** 선택
2. root 계정·비밀번호·디스크 설정 후 배포
3. 배포 후 상세에서 **내부(프라이빗) 호스트·포트(27017)** 확인 → `MONGODB_URI` 조립

### (2) web (Next.js) 서비스 생성
`+` → **GitHub 저장소 배포** → 레포 선택 → 프리셋 **Node.js**

| 항목 | 값 |
|---|---|
| Node 버전 | 20 |
| Install | `npm ci` |
| Build | `npm run build` |
| Start | `npm start` (→ `next start -p 3000`) |
| 포트 | `3000` |

### (3) web 환경변수
```
MONGODB_URI    = mongodb://root:비번@db내부호스트:27017/dubco?authSource=admin
SESSION_SECRET = (랜덤 32자 이상)
NODE_ENV       = production
TZ             = Asia/Seoul
```
> 빌드 OOM 발생 시 `NODE_OPTIONS=--max-old-space-size=512` 추가.

### (4) 첫 배포 후 시드
- 도메인은 첫 배포가 끝나야 발급됩니다.
- Cloudtype web **터미널**에서 최초 1회 실행:
  ```bash
  npm run seed
  ```
  관리자 계정 + 과목/클리닉 날짜 + (데모 데이터)를 upsert 하고 인덱스를 확정합니다.
  MongoDB는 마이그레이션 단계가 없습니다.

> 실서비스에서 데모 학생/세션이 필요 없으면 `scripts/seed.ts` 의 `demoStudents` /
> `seedSessions` / `seedTestMax` 배열을 비우고 배포하세요.

---

## 데이터 모델 (Mongoose)

- **Student** — 학기와 무관한 로그인 계정(name, username, password)
- **Enrollment** — term+student(unique), 학기별 grade·subjects·status,
  2026 2학기 대상 반의 과목별 1학기 중간·기말·등급
- **Session** — term+student+subject+date(unique), 학생입력(attendance·sources·qNumbers·qTypes·request…),
  관리자입력(hwDone·testScore·solved·adminNote). 유니크: `{student, subject, date}`
- **TestConfig** — subject, date, maxScore. 유니크: `{subject, date}` (회차별 테스트 만점)
- **Admin** — username(unique), password(hash)
- **Settings** — 싱글턴: subjects[], clinicDates[]
- **Term** — name(unique), subjects[], clinicDates[], clinicDatesBySubject{반→날짜[]},
  closedSubjects[] (먼저 종료한 반), active(학기 진행 여부), order

테스트 점수는 `testScore / maxScore` 로 100점 환산되어 통계·추이 그래프에 사용됩니다.

## API 라우트

| 메서드 · 경로 | 권한 | 기능 |
|---|---|---|
| `POST /api/auth/login` · `POST /api/auth/logout` | 공통 | 로그인/로그아웃 (세션 쿠키) |
| `GET /api/me` | 로그인 | 내 정보·역할 |
| `GET /api/config` | 로그인 | 과목·클리닉 날짜 |
| `GET /api/sessions` | 학생 | 내 이력 (`?subject=&from=&to=`) |
| `POST /api/sessions` | 학생 | 출결·질문 제출 (upsert) |
| `PATCH /api/sessions/:id` · `DELETE /api/sessions/:id` | 학생 | 내 응답 수정/삭제 |
| `GET /api/stats` | 학생 | 과제 완료율·테스트 평균·추이 |
| `GET` · `PUT /api/school-exams` | 학생 | 본인의 2026 2학기 수업별 1학기 학교 성적 조회·입력 |
| `GET /api/admin/students` · `POST` · `PATCH /:id` · `DELETE /:id` | 관리자 | 학생 계정 CRUD·재원/퇴원 |
| `GET /api/admin/sessions` · `PATCH` · `DELETE /:id` | 관리자 | 현황 조회·채점(upsert)·응답 삭제 |
| `GET /api/admin/testconfig` · `PUT` | 관리자 | 테스트 만점 개수 조회·설정 |

모든 라우트는 진입 시 `dbConnect()` 후 세션 role/소유권을 검증합니다.
학생은 **본인 데이터만** 접근할 수 있습니다.

---

## 학기(분기) 운영

데이터는 **학기(Term)** 단위로 분리됩니다. 각 학기가 자기 **반·클리닉 날짜·명단·기록**을 가지며,
학생 계정은 학기와 무관하게 유지되고 학기별 **등록(Enrollment)** 으로 수강 반이 관리됩니다.
학생은 학기 선택으로 **지난 학기 기록**을 조회할 수 있습니다. 여러 학기를 동시에
진행 상태로 둘 수 있어 여름학기와 2학기를 병행해도 등록·클리닉·성적 데이터가 섞이지 않습니다.

**관리자 화면**: 상단 학기 선택기로 전환, **학기 관리** 탭에서 학기 생성/진행 시작·종료/설정(반·날짜)/삭제.
새 학기 만들 때 이전 학기에서 반·날짜·명단을 복사할 수 있습니다.

**반(수업)별 진행/종료**: 학기 설정에서 반마다 따로 **진행 종료 / 진행 시작**을 누를 수 있어,
학기 전체를 닫지 않고 먼저 끝난 반만 정리할 수 있습니다(`Term.closedSubjects`).
같은 화면에서 **반별 클리닉 날짜를 추가·삭제**합니다(`Term.clinicDatesBySubject`, 공통
`clinicDates` 는 그 union 으로 자동 갱신). 종료된 반은 **클리닉 현황·테스트/과제**의 과목
목록과 **학생 입력 화면**에서 사라지고, 학생의 신규 제출도 서버에서 막힙니다(403).
쌓인 기록은 지워지지 않으며, 관리자는 두 화면의 `종료 수업 포함` 체크로 다시 꺼내볼 수
있습니다. 반 이름은 학생 등록·기록과 문자열로 연결되어 있어 설정 화면에서 바꿀 수 없고
추가·삭제만 가능합니다.

`2026 2학기`의 `고1 공수2`, `고2 미적분1`, `고2 확통` 수강생에게는 학생 화면에
**1학기 성적 입력** 탭이 표시됩니다. 학생은 실제 1학기 학교 과목명과
중간·기말고사 성적, 등급을 입력합니다. 학교 과목은 여러 개 추가·삭제할 수 있으며 학생의
2학기 등록(Enrollment)에 목록으로 저장됩니다. 관리자는 별도 **학교 성적 관리** 탭에서
현재 수강반을 선택하고 학생별 여러 학교 과목을 각각 조회합니다.

**2026 2학기 첨부 명단 정확 반영** (기본은 DRY RUN):
```bash
npx tsx scripts/setup-2026-second-term.ts
npx tsx scripts/setup-2026-second-term.ts --apply
```
기존 학생 계정은 재사용하고 신규 계정만 생성합니다. 이 스크립트는 2학기 명단만 조정하며
여름학기와 기존 학생 기록은 수정하지 않습니다. 엑셀 파서는 검토한 첨부 파일의 SHA-256이
일치할 때만 실행됩니다.

**새 학기 명단 일괄 등록 (엑셀)**:
```bash
# 진행 학기가 여러 개면 반드시 대상 학기 지정
npx tsx scripts/import-students.ts --term="2026 가을"
```
기존 계정은 재사용(비번 유지)하고 신규만 생성하며, 그 학기 반 목록도 자동 갱신됩니다.

**클리닉 날짜 추가** (학기 대상):
```bash
npx tsx scripts/set-clinic-dates.ts --term="2026 가을" 2026-09-05 2026-09-06
```

`2026 여름특강`과 `2026 2학기`의 **과목별 요일 일정 반영** (기본은 DRY RUN):
```bash
node --import tsx scripts/setup-subject-clinic-dates.ts
node --import tsx scripts/setup-subject-clinic-dates.ts --apply
```
과거 Session/TestConfig가 있는 날짜는 과목별 일정에 합쳐 보존하고, 두 학기의 일정 필드만
트랜잭션으로 갱신합니다. Enrollment·Session·TestConfig 문서는 수정하거나 삭제하지 않습니다.

**최초 도입 마이그레이션** (기존 전역 데이터 → 첫 학기):
```bash
npx tsx scripts/migrate-terms.ts "2026 여름특강"   # 최초 1회, 멱등
```

## 모바일 (추후)

- 반응형 UI 유지 → PWA(manifest + service worker) 추가로 홈 화면 앱화 가능.
- 정식 앱 필요 시 Expo(React Native) 로 화면 이식, 이 API 서버 그대로 재사용.
