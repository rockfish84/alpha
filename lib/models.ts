import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/* ============================== Term (학기/분기) ============================== */
const TermSchema = new Schema(
  {
    name: { type: String, required: true, unique: true }, // "2026 여름특강"
    startDate: { type: String, default: "" }, // "YYYY-MM-DD" (선택)
    endDate: { type: String, default: "" },
    subjects: { type: [String], default: [] }, // 이 학기의 반 목록
    clinicDates: { type: [String], default: [] }, // 이 학기의 클리닉 날짜
    active: { type: Boolean, default: false }, // 현재 활성 학기 (하나만 true)
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
const EnrollmentSchema = new Schema(
  {
    term: { type: Schema.Types.ObjectId, ref: "Term", required: true },
    student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    grade: { type: String, default: "" }, // 이 학기 학년
    subjects: { type: [String], default: [] }, // 이 학기 듣는 반
    status: { type: String, enum: ["재원", "퇴원"], default: "재원" },
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
    hwDone: { type: Number, default: null }, // 1(O)/0.5(△)/0(X)/null
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
  maxScore: { type: Number, required: true },
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
