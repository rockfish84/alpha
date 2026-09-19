import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Enrollment, Student, Term } from "@/lib/models";
import { ensureParent } from "@/lib/parents";
import {
  consolidateRosterRecords,
  nextRosterUsername,
  normalizeRosterName,
  normalizeRosterPhone,
  rosterIdentityKey,
  rosterUsernameBase,
  type ImportCandidate,
  type ImportInputError,
  type ImportRecord,
} from "@/lib/roster-import";
import { resolveTerm } from "@/lib/term";

export const dynamic = "force-dynamic";

type PlannedRow = ImportCandidate & {
  kind: "existing" | "new" | "error";
  studentId?: string;
  username: string;
  alreadyEnrolled: boolean;
  currentSubjects: string[];
};

type ImportPlan = {
  rows: PlannedRow[];
  errors: ImportInputError[];
  summary: {
    total: number;
    existing: number;
    newStudents: number;
    alreadyEnrolled: number;
    errors: number;
  };
};

async function makePlan(termId: unknown, records: ImportRecord[]): Promise<ImportPlan> {
  const consolidated = consolidateRosterRecords(records);
  // 퇴원 여부나 현재 학기 등록 여부와 관계없이 Student 전체에서 찾는다.
  // 그래야 쉬었다 돌아온 학생도 기존 계정을 그대로 쓴다.
  const students = await Student.find({})
    .select({ _id: 1, name: 1, phone: 1, username: 1 })
    .lean();
  const byIdentity = new Map<string, any[]>();
  const takenUsernames = new Set<string>();
  for (const student of students) {
    takenUsernames.add(String(student.username ?? ""));
    const key = rosterIdentityKey(student.name, student.phone);
    const list = byIdentity.get(key) ?? [];
    list.push(student);
    byIdentity.set(key, list);
  }

  const matchingIds = consolidated.candidates.flatMap((candidate) =>
    (byIdentity.get(candidate.key) ?? []).map((student) => student._id)
  );
  const enrollments = matchingIds.length
    ? await Enrollment.find({ term: termId, student: { $in: matchingIds } })
        .select({ student: 1, subjects: 1 })
        .lean()
    : [];
  const enrollmentByStudent = new Map(
    enrollments.map((enrollment) => [String(enrollment.student), enrollment])
  );

  const rows: PlannedRow[] = [];
  for (const candidate of consolidated.candidates) {
    const matches = byIdentity.get(candidate.key) ?? [];
    if (matches.length > 1) {
      rows.push({
        ...candidate,
        kind: "error",
        username: "",
        alreadyEnrolled: false,
        currentSubjects: [],
        notes: [...candidate.notes, "같은 이름·학부모 번호의 기존 계정이 2개 이상입니다."],
      });
      continue;
    }

    if (matches.length === 1) {
      const student = matches[0];
      const enrollment = enrollmentByStudent.get(String(student._id));
      rows.push({
        ...candidate,
        kind: "existing",
        studentId: String(student._id),
        username: String(student.username),
        alreadyEnrolled: !!enrollment,
        currentSubjects: (enrollment?.subjects ?? []).map(String),
      });
      continue;
    }

    rows.push({
      ...candidate,
      kind: "new",
      username: nextRosterUsername(rosterUsernameBase(candidate), takenUsernames),
      alreadyEnrolled: false,
      currentSubjects: [],
    });
  }

  const ambiguous = rows.filter((row) => row.kind === "error").length;
  return {
    rows,
    errors: consolidated.errors,
    summary: {
      total: rows.length,
      existing: rows.filter((row) => row.kind === "existing").length,
      newStudents: rows.filter((row) => row.kind === "new").length,
      alreadyEnrolled: rows.filter((row) => row.alreadyEnrolled).length,
      errors: consolidated.errors.length + ambiguous,
    },
  };
}

// POST /api/admin/roster/import
//   commit=false: DB 변경 없이 기존/신규/오류 미리보기
//   commit=true:  같은 검사를 다시 한 뒤 정상 행만 현재 학기에 반영
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  const body = await req.json().catch(() => ({}));
  if (!body.term || !Array.isArray(body.records) || body.records.length === 0) {
    return NextResponse.json(
      { error: "학기와 엑셀 명단이 필요합니다." },
      { status: 400 }
    );
  }
  if (body.records.length > 5000) {
    return NextResponse.json(
      { error: "한 번에 최대 5,000행까지 올릴 수 있습니다." },
      { status: 400 }
    );
  }

  await dbConnect();
  const term = await resolveTerm(body.term);
  if (!term) {
    return NextResponse.json({ error: "학기를 찾을 수 없습니다." }, { status: 400 });
  }

  const plan = await makePlan(term._id, body.records as ImportRecord[]);
  if (!body.commit) return NextResponse.json(plan);

  const validRows = plan.rows.filter((row) => row.kind !== "error");
  if (validRows.length === 0) {
    return NextResponse.json(
      { error: "반영할 수 있는 학생이 없습니다. 오류 내용을 확인해 주세요." },
      { status: 400 }
    );
  }

  // bcrypt 계산은 DB 변경 전에 끝내 두어 중간 실패 가능성을 줄인다.
  const passwordHashes = new Map<string, string>();
  await Promise.all(
    validRows
      .filter((row) => row.kind === "new")
      .map(async (row) => passwordHashes.set(row.key, await bcrypt.hash(row.phone, 10)))
  );

  let createdStudents = 0;
  let newEnrollments = 0;
  let updatedEnrollments = 0;
  const importedSubjects = new Set<string>();

  for (const row of validRows) {
    let student: any;
    if (row.kind === "existing") {
      student = await Student.findById(row.studentId);
      if (!student) throw new Error(`${row.name} 학생 계정이 처리 중 사라졌습니다.`);
    } else {
      student = await Student.create({
        name: normalizeRosterName(row.name),
        username: row.username,
        password: passwordHashes.get(row.key),
        phone: normalizeRosterPhone(row.phone),
        school: String(row.school ?? ""),
      });
      createdStudents++;
    }

    // 기존 학생의 이름·학교·번호·비밀번호는 건드리지 않는다.
    // 이 학기 등록만 만들거나, 이미 있으면 새 반을 합치고 재원으로 되돌린다.
    const enrollment = await Enrollment.findOne({ term: term._id, student: student._id });
    if (enrollment) {
      enrollment.subjects = [...new Set([...(enrollment.subjects ?? []).map(String), ...row.subjects])];
      if (row.grade) enrollment.grade = row.grade;
      enrollment.status = "재원";
      await enrollment.save();
      updatedEnrollments++;
    } else {
      await Enrollment.create({
        term: term._id,
        student: student._id,
        grade: row.grade,
        subjects: row.subjects,
        status: "재원",
      });
      newEnrollments++;
    }
    row.subjects.forEach((subject) => importedSubjects.add(subject));
    await ensureParent(student);
  }

  await Term.updateOne(
    { _id: term._id },
    { $addToSet: { subjects: { $each: [...importedSubjects] } } }
  );

  return NextResponse.json({
    ok: true,
    createdStudents,
    newEnrollments,
    updatedEnrollments,
    skipped: plan.summary.errors,
    subjectsAdded: [...importedSubjects],
  });
}
