import { isoDate } from "./date";

/** Mongoose doc (lean or hydrated) -> plain client shape. */
export function serializeStudent(doc: any) {
  return {
    id: String(doc._id),
    name: doc.name as string,
    username: doc.username as string,
    // 관리자 전용 라우트에서만 사용됨 (평문 비밀번호 = 부모 번호)
    password: (doc.passwordPlain ?? "") as string,
    grade: (doc.grade ?? "") as string,
    status: doc.status as "재원" | "퇴원",
    subjects: (doc.subjects ?? []) as string[],
  };
}

export type ClientStudent = ReturnType<typeof serializeStudent>;

export function serializeSession(
  doc: any,
  maxMap?: Record<string, number>
) {
  const date = isoDate(doc.date);
  const subject = doc.subject as string;
  return {
    id: String(doc._id),
    studentId: String(doc.student),
    subject,
    date,
    submitted: !!doc.submitted,
    attendance: doc.attendance as "출석" | "지각" | "결석",
    lateTime: (doc.lateTime ?? "") as string,
    absentReason: (doc.absentReason ?? "") as string,
    sources: (doc.sources ?? []) as string[],
    sourcesEtc: (doc.sourcesEtc ?? "") as string,
    qNumbers: (doc.qNumbers ?? "") as string,
    qTypes: (doc.qTypes ?? []) as string[],
    qTypesEtc: (doc.qTypesEtc ?? "") as string,
    request: (doc.request ?? "") as string,
    hwDone: (doc.hwDone ?? null) as number | null, // 1(O)/0.5(△)/0(X)/null
    testScore: (doc.testScore ?? null) as number | null,
    testDetail: (doc.testDetail ?? "") as string,
    solved: (doc.solved ?? "") as string,
    adminNote: (doc.adminNote ?? "") as string,
    // 테스트 만점 기본 10 (별도 설정이 없으면 10으로 간주)
    max: maxMap ? maxMap[`${date}|${subject}`] ?? 10 : 10,
  };
}

export type ClientSession = ReturnType<typeof serializeSession>;
