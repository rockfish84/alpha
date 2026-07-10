import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/* ============================== Student ============================== */
const StudentSchema = new Schema(
  {
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // bcrypt hash (인증용)
    passwordPlain: { type: String, default: "" }, // 관리자 조회용 평문 (부모 번호)
    grade: { type: String, default: "" },
    status: { type: String, enum: ["재원", "퇴원"], default: "재원" },
    subjects: { type: [String], default: [] }, // 예: ["수학"]
  },
  { timestamps: true }
);

/* ============================== Session ============================== */
const SessionSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    subject: { type: String, required: true },
    date: { type: Date, required: true },

    // 학생 입력 (구글폼 대체)
    submitted: { type: Boolean, default: false },
    attendance: { type: String, enum: ["출석", "지각", "결석"], default: "출석" },
    lateTime: { type: String, default: "" },
    absentReason: { type: String, default: "" },
    sources: { type: [String], default: [] }, // 질문 출처
    sourcesEtc: { type: String, default: "" },
    qNumbers: { type: String, default: "" }, // 질문할 문제 번호
    qTypes: { type: [String], default: [] }, // 질문 유형(중복)
    qTypesEtc: { type: String, default: "" },
    request: { type: String, default: "" }, // 선생님께 특별 요청

    // 관리자 입력
    hwDone: { type: Number, default: null }, // 과제: 1(O) / 0.5(△) / 0(X) / null(미입력)
    testScore: { type: Number, default: null }, // 테스트 맞은 개수
    testMaxOverride: { type: Number, default: null }, // 이 학생만 다른 만점일 때 (없으면 반 기본값)
    testDetail: { type: String, default: "" }, // 테스트 문항 (예: 3,6,9번)
    solved: { type: String, default: "" }, // 해결 문제
    adminNote: { type: String, default: "" }, // 비고 / 특이사항
  },
  { timestamps: true }
);
// 학생·과목·날짜당 1건
SessionSchema.index({ student: 1, subject: 1, date: 1 }, { unique: true });

/* ============================== TestConfig ============================== */
const TestConfigSchema = new Schema({
  subject: { type: String, required: true },
  date: { type: Date, required: true },
  maxScore: { type: Number, required: true }, // 회차별 테스트 만점 개수
});
TestConfigSchema.index({ subject: 1, date: 1 }, { unique: true });

/* ============================== Admin ============================== */
const AdminSchema = new Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // bcrypt hash
});

/* ============================== Settings ============================== */
// 앱 전역 설정(과목 목록, 클리닉 날짜)을 담는 싱글턴 문서.
const SettingsSchema = new Schema({
  key: { type: String, required: true, unique: true, default: "app" },
  subjects: { type: [String], default: ["수학"] },
  clinicDates: { type: [String], default: [] }, // "YYYY-MM-DD"
});

export type StudentDoc = InferSchemaType<typeof StudentSchema>;
export type SessionDoc = InferSchemaType<typeof SessionSchema>;
export type TestConfigDoc = InferSchemaType<typeof TestConfigSchema>;
export type AdminDoc = InferSchemaType<typeof AdminSchema>;
export type SettingsDoc = InferSchemaType<typeof SettingsSchema>;

export const Student =
  (models.Student as Model<StudentDoc>) || model("Student", StudentSchema);
export const Session =
  (models.Session as Model<SessionDoc>) || model("Session", SessionSchema);
export const TestConfig =
  (models.TestConfig as Model<TestConfigDoc>) ||
  model("TestConfig", TestConfigSchema);
export const Admin =
  (models.Admin as Model<AdminDoc>) || model("Admin", AdminSchema);
export const Settings =
  (models.Settings as Model<SettingsDoc>) || model("Settings", SettingsSchema);
