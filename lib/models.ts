import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import {
  SCHOOL_EXAM_GRADE_MAX_LENGTH,
  SCHOOL_EXAM_NAME_MAX_LENGTH,
  SCHOOL_EXAM_SUBJECTS,
} from "./school-exams";

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
    password: { type: String, required: true }, // bcrypt hash
    passwordPlain: { type: String, default: "" }, // 관리자 조회용 평문
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
    hwSsen: { type: Number, default: null }, // 과제(쎈) 1(O)/0.5(△)/0(X)/null
    testScore: { type: Number, default: null },
    testMaxOverride: { type: Number, default: null },
    testDetail: { type: String, default: "" },
    solved: { type: String, default: "" },
    adminNote: { type: String, default: "" },
  },
  { timestamps: true }
);
// 학기·학생·과목·날짜당 1건
SessionSchema.index({ term: 1, student: 1, subject: 1, date: 1 }, { unique: true });

/* ============================== TestConfig ============================== */
const TestConfigSchema = new Schema({
  term: { type: Schema.Types.ObjectId, ref: "Term", required: true },
  subject: { type: String, required: true },
  date: { type: Date, required: true },
  maxScore: { type: Number, default: 10 },
  detail: { type: String, default: "" }, // 테스트 문항 (예: 3,6,9번) — 반 공통
  additionalMessage: { type: String, default: "" }, // 주간 문자 머리말 아래에 넣을 날짜·반별 안내
});
TestConfigSchema.index({ term: 1, subject: 1, date: 1 }, { unique: true });

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
export type AdminDoc = InferSchemaType<typeof AdminSchema>;

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
export const Admin =
  (models.Admin as Model<AdminDoc>) || model("Admin", AdminSchema);
