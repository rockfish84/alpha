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

- **Student** — name, username(unique), password(hash), grade, status(재원/퇴원), subjects[]
- **Session** — student(ref), subject, date, 학생입력(attendance·sources·qNumbers·qTypes·request…),
  관리자입력(hwDone·testScore·solved·adminNote). 유니크: `{student, subject, date}`
- **TestConfig** — subject, date, maxScore. 유니크: `{subject, date}` (회차별 테스트 만점)
- **Admin** — username(unique), password(hash)
- **Settings** — 싱글턴: subjects[], clinicDates[]

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
| `GET /api/admin/students` · `POST` · `PATCH /:id` · `DELETE /:id` | 관리자 | 학생 계정 CRUD·재원/퇴원 |
| `GET /api/admin/sessions` · `PATCH` · `DELETE /:id` | 관리자 | 현황 조회·채점(upsert)·응답 삭제 |
| `GET /api/admin/testconfig` · `PUT` | 관리자 | 테스트 만점 개수 조회·설정 |

모든 라우트는 진입 시 `dbConnect()` 후 세션 role/소유권을 검증합니다.
학생은 **본인 데이터만** 접근할 수 있습니다.

---

## 모바일 (추후)

- 반응형 UI 유지 → PWA(manifest + service worker) 추가로 홈 화면 앱화 가능.
- 정식 앱 필요 시 Expo(React Native) 로 화면 이식, 이 API 서버 그대로 재사용.
