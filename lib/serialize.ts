import { isoDate } from "./date";
import { serializeSchoolExamResults } from "./school-exams";

/** Mongoose doc (lean or hydrated) -> plain client shape. */
export function serializeStudent(doc: any) {
  return {
    id: String(doc._id),
    name: doc.name as string,
    username: doc.username as string,
    // 문자 수신번호. 비밀번호는 해시만 저장하므로 어디로도 나가지 않는다.
    phone: (doc.phone ?? "") as string,
    grade: (doc.grade ?? "") as string,
    status: doc.status as "재원" | "퇴원",
    subjects: (doc.subjects ?? []) as string[],
  };
}

export type ClientStudent = ReturnType<typeof serializeStudent>;

/** Enrollment + Student(+Parent) -> 학기별 명단 행 (관리자용). 비밀번호는 담지 않는다. */
export function serializeRoster(enr: any, stu: any, parent?: any) {
  return {
    id: String(stu._id), // student id (세션 patch 등에서 사용)
    enrollmentId: String(enr._id),
    name: stu.name as string,
    username: stu.username as string,
    phone: (stu.phone ?? "") as string,
    school: (stu.school ?? "") as string,
    grade: (enr.grade ?? "") as string,
    subjects: (enr.subjects ?? []) as string[],
    status: (enr.status ?? "재원") as "재원" | "퇴원",
    // 학부모 계정: 아이디는 학생과 같다. 비밀번호는 보여 주지 않고, 바뀌었는지만 알려 준다.
    parentChanged: !!parent?.selfChanged,
    // 관리자 학교 성적 탭에서 조회할 학생의 학교 과목 목록.
    schoolExamResults: serializeSchoolExamResults(enr.schoolExamResults),
  };
}

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
    attnAdmin: !!doc.attnAdmin,
    attendance: doc.attendance as "출석" | "지각" | "결석",
    lateTime: (doc.lateTime ?? "") as string,
    absentReason: (doc.absentReason ?? "") as string,
    sources: (doc.sources ?? []) as string[],
    sourcesEtc: (doc.sourcesEtc ?? "") as string,
    qNumbers: (doc.qNumbers ?? "") as string,
    qTypes: (doc.qTypes ?? []) as string[],
    qTypesEtc: (doc.qTypesEtc ?? "") as string,
    request: (doc.request ?? "") as string,
    hwDone: (doc.hwDone ?? null) as number | null, // 프린트 1(O)/0.5(△)/0(X)/null
    hwSsen: (doc.hwSsen ?? null) as number | null, // 쎈 1(O)/0.5(△)/0(X)/null
    testScore: (doc.testScore ?? null) as number | null,
    testMaxOverride: (doc.testMaxOverride ?? null) as number | null,
    testDetail: (doc.testDetail ?? "") as string,
    testAuto: !!doc.testAuto,
    testScale100: !!doc.testScale100,
    solved: (doc.solved ?? "") as string,
    adminNote: (doc.adminNote ?? "") as string,
    // 유효 만점: 학생별 override > 반 설정 > 기본 100 (테스트는 100점 만점)
    max: (doc.testMaxOverride ??
      (maxMap ? maxMap[`${date}|${subject}`] ?? 100 : 100)) as number,
  };
}

export type ClientSession = ReturnType<typeof serializeSession>;
