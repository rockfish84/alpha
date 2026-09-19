import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import {
  SCHOOL_EXAM_GRADE_MAX_LENGTH,
  SCHOOL_EXAM_NAME_MAX_LENGTH,
  SCHOOL_EXAM_SUBJECTS,
} from "./school-exams";
import { DIFFICULTIES } from "./grading";

/* ============================== Term (학기/분기) ============================== */
const TermSchema = new Schema(
  {
    name: { type: String, required: true, unique: true }, // "2026 여름특강"
    startDate: { type: String, default: "" }, // "YYYY-MM-DD" (선택)
    endDate: { type: String, default: "" },
    subjects: { type: [String], default: [] }, // 이 학기의 반 목록
    clinicDates: { type: [String], default: [] }, // 이 학기의 클리닉 날짜
    // 과목별 클리닉 날짜. 키가 없는 기존 학기는 clinicDates를 공통 일정으로 사용한다.
    clinicDatesBySubject: { type: Map, of: [String], default: {} },
    // 반별 유형(출제 단원) 표시 순서. 학생 화면의 "유형별 강약점 · 단원 순" 정렬에 쓴다.
    typeOrderBySubject: { type: Map, of: [String], default: {} },
    // 학기 안에서 먼저 종료한 반. 종료된 반은 클리닉 현황·테스트/과제·학생 입력에서 숨긴다.
    closedSubjects: { type: [String], default: [] },
    active: { type: Boolean, default: false }, // 진행 중인 학기 (여러 학기 동시 진행 가능)
    schoolExamInput: { type: Boolean, default: false }, // 학생 1학기 학교 성적 입력 기능
    order: { type: Number, default: 0 }, // 정렬용 (클수록 최신)
  },
  { timestamps: true }
);

/* ============================== Student (계정 정체성) ============================== */
// 학년·과목·재원상태는 학기마다 달라지므로 Enrollment 로 이동. Student 는 로그인 정체성만.
const StudentSchema = new Schema(
  {
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // bcrypt hash (평문은 어디에도 저장하지 않는다)
    phone: { type: String, default: "" }, // 학부모 문자 수신번호 (비밀번호와 별개)
    school: { type: String, default: "" }, // 재학 중인 학교 (예: 둔산여고)
    // legacy(학기 이전) 필드 — 마이그레이션 후 사용 안 함
    grade: { type: String, default: "" },
    status: { type: String, default: "재원" },
    subjects: { type: [String], default: [] },
  },
  { timestamps: true }
);

/* ============================== Enrollment (학기별 등록) ============================== */
const SchoolExamResultSchema = new Schema(
  {
    subject: {
      type: String,
      enum: [...SCHOOL_EXAM_SUBJECTS],
      required: false, // 이전 현재-수강반별 저장값 호환용. 신규 학교 과목 행에는 사용하지 않음.
    },
    schoolSubjectName: {
      type: String,
      default: "",
      maxlength: SCHOOL_EXAM_NAME_MAX_LENGTH,
    },
    midtermScore: { type: Number, default: null, min: 0, max: 100 },
    finalScore: { type: Number, default: null, min: 0, max: 100 },
    grade: { type: String, default: "", maxlength: SCHOOL_EXAM_GRADE_MAX_LENGTH },
  },
  { _id: false }
);

const EnrollmentSchema = new Schema(
  {
    term: { type: Schema.Types.ObjectId, ref: "Term", required: true },
    student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    grade: { type: String, default: "" }, // 이 학기 학년
    subjects: { type: [String], default: [] }, // 이 학기 듣는 반
    status: { type: String, enum: ["재원", "퇴원"], default: "재원" },
    // 2026 2학기 대상 학생의 1학기 학교 성적 과목 목록 (학기 등록별 저장)
    schoolExamResults: { type: [SchoolExamResultSchema], default: [] },
  },
  { timestamps: true }
);
EnrollmentSchema.index({ term: 1, student: 1 }, { unique: true });

/* ============================== Session ============================== */
const SessionSchema = new Schema(
  {
    term: { type: Schema.Types.ObjectId, ref: "Term", required: true },
    student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    subject: { type: String, required: true },
    date: { type: Date, required: true },

    // 학생 입력
    submitted: { type: Boolean, default: false },
    // 관리자가 직접 출석을 기록한 경우 (학생 미제출이어도 출석 표시)
    attnAdmin: { type: Boolean, default: false },
    attendance: { type: String, enum: ["출석", "지각", "결석"], default: "출석" },
    lateTime: { type: String, default: "" },
    absentReason: { type: String, default: "" },
    sources: { type: [String], default: [] },
    sourcesEtc: { type: String, default: "" },
    qNumbers: { type: String, default: "" },
    qTypes: { type: [String], default: [] },
    qTypesEtc: { type: String, default: "" },
    request: { type: String, default: "" },

    // 관리자 입력
    hwDone: { type: Number, default: null }, // 과제(프린트) 1(O)/0.5(△)/0(X)/null
    hwSsen: { type: Number, default: null }, // 과제(부교재) 1(O)/0.5(△)/0(X)/null
    testScore: { type: Number, default: null },
    testMaxOverride: { type: Number, default: null },
    testDetail: { type: String, default: "" },
    // 성적 입력 탭에서 받은 학생 답안 { "8-(1)": "3", ... }. 자동 채점의 원본.
    testAnswers: { type: Map, of: String, default: undefined },
    // 이 학생만 안 푸는 문항 ("4", "8-(1)"). 미제출과 달리 만점에서 빠진다.
    testExcluded: { type: [String], default: undefined },
    testAuto: { type: Boolean, default: false }, // testScore 가 자동 채점 결과인지
    // testScore 가 100점 환산 값인지 (옛 "맞은 개수" 점수와 구분)
    testScale100: { type: Boolean, default: false },
    solved: { type: String, default: "" },
    adminNote: { type: String, default: "" },
  },
  { timestamps: true }
);
// 학기·학생·과목·날짜당 1건
SessionSchema.index({ term: 1, student: 1, subject: 1, date: 1 }, { unique: true });

/* ============================== TestConfig (회차 테스트 설정 + 답안 키) ============================== */
const TestQuestionSchema = new Schema(
  {
    no: { type: Number, required: true }, // 주 문항 번호
    part: { type: Number, default: 0 }, // 0 = 부분문제 없음, 1 = (1) …
    answer: { type: String, default: "" }, // "|" 로 복수 정답
    points: { type: Number, default: 1 }, // 배점
    type: { type: String, default: "" }, // 유형 / 출제 단원
    difficulty: { type: String, enum: [...DIFFICULTIES, ""], default: "" },
    choices: { type: Number, default: 5 }, // 보기 수 (0 = 주관식)
  },
  { _id: false }
);

// 시험지·해설지 PDF 안에서 각 문항이 차지하는 영역 (좌표만 저장 → 용량 거의 안 씀)
const RegionRectSchema = new Schema(
  {
    page: { type: Number, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    pw: { type: Number, required: true },
    ph: { type: Number, required: true },
  },
  { _id: false }
);

const QuestionRegionSchema = new Schema(
  {
    no: { type: Number, required: true },
    kind: { type: String, enum: ["paper", "solution"], required: true },
    fileId: { type: String, required: true },
    rects: { type: [RegionRectSchema], default: [] },
    answerRect: { type: Number, default: null },
    answerY: { type: Number, default: null },
  },
  { _id: false }
);

const TestConfigSchema = new Schema({
  term: { type: Schema.Types.ObjectId, ref: "Term", required: true },
  subject: { type: String, required: true },
  date: { type: Date, required: true },
  maxScore: { type: Number, default: 100 }, // 테스트는 항상 100점 만점
  detail: { type: String, default: "" }, // 테스트 문항 (예: 3,6,9번) — 반 공통
  additionalMessage: { type: String, default: "" }, // 주간 문자 머리말 아래에 넣을 날짜·반별 안내
  questions: { type: [TestQuestionSchema], default: [] }, // 답안 키 (없으면 수동 점수 입력 회차)
  answersPublished: { type: Boolean, default: true }, // 학생·학부모에게 분석 공개
  questionRegions: { type: [QuestionRegionSchema], default: [] }, // 문항별 시험지·해설지 위치
});
TestConfigSchema.index({ term: 1, subject: 1, date: 1 }, { unique: true });

/* ============================== Bookmark (오답 노트 별표) ============================== */
// 학생이 다시 볼 문항에 직접 별표를 찍는다. 문항은 (학기·반·날짜·문번)으로 식별한다.
const BookmarkSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    term: { type: Schema.Types.ObjectId, ref: "Term", required: true },
    subject: { type: String, required: true },
    date: { type: Date, required: true },
    label: { type: String, required: true }, // "8" 또는 "8-(1)"
  },
  { timestamps: true }
);
BookmarkSchema.index(
  { student: 1, term: 1, subject: 1, date: 1, label: 1 },
  { unique: true }
);

/* ============================== Parent (학부모 계정) ============================== */
// 학생과 같은 아이디·비밀번호로 시작하지만 별도 문서 → 각자 비밀번호를 바꿀 수 있다.
const ParentSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "Student", required: true, unique: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // bcrypt hash (로그인 검증용)
    // 학원이 발급한 비밀번호의 암호화 사본. 학부모 계정은 학원이 만들어 통지하는
    // 조회 전용 계정이라 관리자가 다시 확인할 수 있어야 한다 (lib/secret-box.ts).
    // 여는 열쇠는 SESSION_SECRET 이며, 평문으로는 저장하지 않는다.
    passwordSealed: { type: String, default: "" },
    // (예전 방식) 학부모가 직접 비밀번호를 바꿨는지
    selfChanged: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/* ============================== ShareLink (성적 공유 링크) ==============================
   문자에 붙이는 "로그인 없이 그 회차 성적만 보는" 만료형 링크.
   토큰 하나가 (학생 · 학기 · 반 · 날짜) 한 칸만 열어 주고, 만료되면 TTL 인덱스로 사라진다. */
const ShareLinkSchema = new Schema(
  {
    token: { type: String, required: true, unique: true }, // 128비트 난수
    student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    term: { type: Schema.Types.ObjectId, ref: "Term", required: true },
    subject: { type: String, required: true },
    date: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    revoked: { type: Boolean, default: false }, // 관리자가 즉시 끊을 수 있다
    views: { type: Number, default: 0 },
    lastViewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
ShareLinkSchema.index({ student: 1, term: 1, subject: 1, date: 1 });
// 만료 시각이 지나면 MongoDB 가 문서를 자동으로 지운다 → 링크도 함께 죽는다.
ShareLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/* ============================== Admin ============================== */
const AdminSchema = new Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

export type TermDoc = InferSchemaType<typeof TermSchema>;
export type StudentDoc = InferSchemaType<typeof StudentSchema>;
export type EnrollmentDoc = InferSchemaType<typeof EnrollmentSchema>;
export type SessionDoc = InferSchemaType<typeof SessionSchema>;
export type TestConfigDoc = InferSchemaType<typeof TestConfigSchema>;
export type BookmarkDoc = InferSchemaType<typeof BookmarkSchema>;
export type ParentDoc = InferSchemaType<typeof ParentSchema>;
export type AdminDoc = InferSchemaType<typeof AdminSchema>;
export type ShareLinkDoc = InferSchemaType<typeof ShareLinkSchema>;
export type TestQuestionDoc = InferSchemaType<typeof TestQuestionSchema>;

export const Term = (models.Term as Model<TermDoc>) || model("Term", TermSchema);
export const Student =
  (models.Student as Model<StudentDoc>) || model("Student", StudentSchema);
export const Enrollment =
  (models.Enrollment as Model<EnrollmentDoc>) ||
  model("Enrollment", EnrollmentSchema);
export const Session =
  (models.Session as Model<SessionDoc>) || model("Session", SessionSchema);
export const TestConfig =
  (models.TestConfig as Model<TestConfigDoc>) ||
  model("TestConfig", TestConfigSchema);
export const Bookmark =
  (models.Bookmark as Model<BookmarkDoc>) || model("Bookmark", BookmarkSchema);
export const Parent =
  (models.Parent as Model<ParentDoc>) || model("Parent", ParentSchema);
export const Admin =
  (models.Admin as Model<AdminDoc>) || model("Admin", AdminSchema);
export const ShareLink =
  (models.ShareLink as Model<ShareLinkDoc>) || model("ShareLink", ShareLinkSchema);
