/**
 * 2026 2학기 수강 명단을 엑셀과 정확히 일치시키는 일회성/재실행 가능 마이그레이션.
 *
 * 기본 실행은 읽기 전용 미리보기다.
 *   npx tsx scripts/setup-2026-second-term.ts
 *   npx tsx scripts/setup-2026-second-term.ts --file="/path/to/명단.xlsx"
 *
 * 미리보기 결과를 확인한 뒤에만 실제 반영한다.
 *   npx tsx scripts/setup-2026-second-term.ts --apply
 *
 * 안전 원칙:
 * - "2026 2학기" Term/Enrollment 외의 학기 데이터는 수정하지 않는다.
 * - 기존 Student 문서는 비밀번호를 포함해 어떤 필드도 수정/삭제하지 않는다.
 * - 계정이 정말 없을 때만 부모 전화번호를 bcrypt 해시한 새 Student를 만든다.
 * - 대상 학기의 기존 Session이 하나라도 있으면 불필요 Enrollment 삭제를 중단한다.
 */
import "dotenv/config";
import path from "node:path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import mongoose, { type Types } from "mongoose";
import xlsx from "xlsx";
import { dbConnect } from "../lib/db";
import { Enrollment, Session, Student, Term } from "../lib/models";

const DEFAULT_FILE = "오현민T  수강신청 면단 (1).xlsx";
const EXPECTED_FILE_SHA256 =
  "a6167bdd90bf865b6b544445bc0d61540ea0927e096cdf7cf0d6042db726291b";
const TARGET_TERM_NAME = "2026 2학기";
const TARGET_SUBJECTS = ["고1 공수2", "고2 미적분1", "고2 확통"] as const;
type TargetSubject = (typeof TARGET_SUBJECTS)[number];

const SECTION_SUBJECTS: Readonly<Record<string, TargetSubject>> = {
  공수2: "고1 공수2",
  미적1: "고2 미적분1",
  확통: "고2 확통",
};

const EXPECTED_GRADES: Readonly<Record<TargetSubject, string>> = {
  "고1 공수2": "고1",
  "고2 미적분1": "고2",
  "고2 확통": "고2",
};

type Args = {
  apply: boolean;
  filePath: string;
  help: boolean;
};

type ParsedRecord = {
  location: string;
  originalName: string;
  name: string;
  school: string;
  username: string;
  grade: string;
  subject: TargetSubject;
  parentPhone: string | null;
  nameSuffixRemoved: boolean;
};

type RosterAccount = {
  username: string;
  name: string;
  school: string;
  grade: string;
  subjects: TargetSubject[];
  parentPhones: Set<string>;
  locations: string[];
};

type StudentRow = {
  _id: Types.ObjectId;
  name: string;
  username: string;
};

type TermRow = {
  _id: Types.ObjectId;
  name: string;
  subjects?: string[];
  clinicDates?: string[];
  startDate?: string;
  endDate?: string;
  active?: boolean;
  schoolExamInput?: boolean;
  order?: number;
};

type EnrollmentRow = {
  _id: Types.ObjectId;
  student: Types.ObjectId;
  grade?: string;
  subjects?: string[];
  status?: string;
  schoolExamResults?: unknown[];
};

let targetStagedInactive = false;

function usage(): string {
  return [
    "사용법:",
    "  npx tsx scripts/setup-2026-second-term.ts [--file=명단.xlsx]",
    "  npx tsx scripts/setup-2026-second-term.ts [--file=명단.xlsx] --apply",
    "",
    "옵션:",
    "  --file=PATH  검토된 첨부 명단의 경로 (내용 SHA-256 검증, 기본: 현재 폴더)",
    "  --apply      실제 DB 반영. 없으면 항상 DRY RUN",
    "  --help       도움말",
  ].join("\n");
}

function parseArgs(argv: string[]): Args {
  let apply = false;
  let help = false;
  let filePath = path.resolve(process.cwd(), DEFAULT_FILE);

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg.startsWith("--file=")) {
      const value = arg.slice("--file=".length).trim();
      if (!value) throw new Error("--file= 뒤에 엑셀 경로가 필요합니다.");
      filePath = path.resolve(process.cwd(), value);
    } else {
      throw new Error(`알 수 없는 옵션: ${safeForLog(arg)}`);
    }
  }

  return { apply, filePath, help };
}

function textCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function safeForLog(value: unknown): string {
  return textCell(value).replace(/[\u0000-\u001f\u007f]/g, "?");
}

function redactPhones(value: unknown): string {
  return safeForLog(value)
    .replace(/01[016789](?:[ .()/-]*\d){7,8}/g, "[전화번호 숨김]")
    .replace(/\b1[016789]\d{8}\b/g, "[전화번호 숨김]");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/** 셀에서 한국 휴대전화 번호만 숫자 문자열로 뽑는다. */
function extractMobilePhones(value: unknown): string[] {
  const raw = textCell(value);
  if (!raw) return [];

  const found: string[] = [];
  for (const match of raw.matchAll(/01[016789](?:[ .()/-]*\d){7,8}/g)) {
    const digits = match[0].replace(/\D/g, "");
    if (/^01[016789]\d{7,8}$/.test(digits)) found.push(digits);
  }

  // 숫자로 저장된 엑셀 셀은 맨 앞 0이 사라질 수 있다.
  if (!found.length) {
    const compact = raw.replace(/\D/g, "");
    if (/^1[016789]\d{7,8}$/.test(compact)) found.push(`0${compact}`);
  }

  return unique(found);
}

/** 여러 번호가 있으면 기존 명단 규칙대로 모 → 무표기 → 첫 번호 순으로 고른다. */
function pickParentPhone(value: unknown): string | null {
  const raw = textCell(value);
  const phones = extractMobilePhones(raw);
  if (!phones.length) return null;
  if (phones.length === 1) return phones[0];

  const occurrences = phones.map((phone) => {
    const index = raw.indexOf(phone);
    const context = index >= 0 ? raw.slice(Math.max(0, index - 4), index + phone.length + 4) : "";
    const label = /모/.test(context) ? "모" : /부/.test(context) ? "부" : "";
    return { phone, label };
  });
  return (
    occurrences.find((item) => item.label === "모") ??
    occurrences.find((item) => item.label === "") ??
    occurrences[0]
  ).phone;
}

function normalizeName(
  rawName: string,
  suppliedPhoneCells: unknown[]
): { name: string; suffixRemoved: boolean } {
  const trimmed = rawName.trim();
  const match = trimmed.match(/^(.+?)(\d{4})$/u);
  if (!match) return { name: trimmed, suffixRemoved: false };

  const [, base, suffix] = match;
  const lastFour = suppliedPhoneCells
    .flatMap(extractMobilePhones)
    .map((phone) => phone.slice(-4));
  if (!lastFour.includes(suffix) || !/[^\d\s]/u.test(base)) {
    return { name: trimmed, suffixRemoved: false };
  }

  return { name: base.trim(), suffixRemoved: true };
}

function normalizeSectionKey(value: string): string | null {
  const match = value.match(/^\s*\[([^\]]+)\]/u);
  return match ? match[1].replace(/\s+/g, "") : null;
}

function normalizeGrade(rawGrade: unknown, subject: TargetSubject, location: string): string {
  const value = textCell(rawGrade);
  const digit = value.match(/[1-3]/)?.[0] ?? "";
  if (!digit) throw new Error(`${location}: 학년 값이 없습니다.`);

  const grade = `고${digit}`;
  if (grade !== EXPECTED_GRADES[subject]) {
    throw new Error(
      `${location}: ${subject}의 학년은 ${EXPECTED_GRADES[subject]}이어야 하지만 ${grade}입니다.`
    );
  }
  return grade;
}

function usernameFor(name: string, school: string): string {
  return `${name}${school}`.replace(/\s+/g, "");
}

function assertReviewedWorkbook(filePath: string): void {
  const digest = createHash("sha256").update(readFileSync(filePath)).digest("hex");
  if (digest !== EXPECTED_FILE_SHA256) {
    throw new Error(
      "검토한 첨부 명단과 파일 내용이 다릅니다. 임의 엑셀은 이 마이그레이션에서 읽지 않습니다."
    );
  }
}

/**
 * 정해진 표 열만 읽는다. 셀의 문장/메모/수식은 명령으로 해석하지 않는다.
 * 열: 성명, 부모핸드폰, 학생핸드폰, 학교, 학년
 */
function readWorkbook(filePath: string): ParsedRecord[] {
  const workbook = xlsx.readFile(filePath, {
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
  });
  const records: ParsedRecord[] = [];
  const seenSections = new Set<TargetSubject>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    let subject: TargetSubject | null = null;
    let insideRosterTable = false;

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex] ?? [];
      const first = textCell(row[0]);
      const location = `${safeForLog(sheetName)}!${rowIndex + 1}행`;
      const sectionKey = normalizeSectionKey(first);
      if (sectionKey !== null) {
        subject = SECTION_SUBJECTS[sectionKey] ?? null;
        insideRosterTable = false;
        if (subject) seenSections.add(subject);
        continue;
      }

      if (first.replace(/\s+/g, "") === "성명") {
        insideRosterTable = subject !== null;
        continue;
      }
      if (!subject || !insideRosterTable) continue;

      const originalName = first;
      const school = textCell(row[3]).replace(/\s+/g, " ");
      if (!originalName && !school) continue;
      if (!originalName) throw new Error(`${location}: 성명이 없는 명단 행입니다.`);
      if (!school) throw new Error(`${location}: ${safeForLog(originalName)}의 학교가 없습니다.`);

      const parentPhoneCell = row[1];
      const studentPhoneCell = row[2];
      const { name, suffixRemoved } = normalizeName(originalName, [
        parentPhoneCell,
        studentPhoneCell,
      ]);
      const username = usernameFor(name, school);
      if (!name || !username) throw new Error(`${location}: 학생 이름/아이디를 만들 수 없습니다.`);

      records.push({
        location,
        originalName,
        name,
        school,
        username,
        grade: normalizeGrade(row[4], subject, location),
        subject,
        parentPhone: pickParentPhone(parentPhoneCell),
        nameSuffixRemoved: suffixRemoved,
      });
    }
  }

  const missingSections = TARGET_SUBJECTS.filter((subject) => !seenSections.has(subject));
  if (missingSections.length) {
    throw new Error(`엑셀에서 반 구역을 찾지 못했습니다: ${missingSections.join(", ")}`);
  }
  for (const subject of TARGET_SUBJECTS) {
    if (!records.some((record) => record.subject === subject)) {
      throw new Error(`${subject} 구역에 학생 명단이 없습니다.`);
    }
  }
  return records;
}

function orderedSubjects(subjects: Iterable<TargetSubject>): TargetSubject[] {
  const present = new Set(subjects);
  return TARGET_SUBJECTS.filter((subject) => present.has(subject));
}

function buildRoster(records: ParsedRecord[]): RosterAccount[] {
  const byUsername = new Map<string, RosterAccount>();

  for (const record of records) {
    const current = byUsername.get(record.username);
    if (!current) {
      byUsername.set(record.username, {
        username: record.username,
        name: record.name,
        school: record.school,
        grade: record.grade,
        subjects: [record.subject],
        parentPhones: new Set(record.parentPhone ? [record.parentPhone] : []),
        locations: [record.location],
      });
      continue;
    }

    if (
      current.name !== record.name ||
      current.school !== record.school ||
      current.grade !== record.grade
    ) {
      throw new Error(
        `${record.location}: ${safeForLog(record.username)}의 이름/학교/학년 값이 다른 행과 충돌합니다.`
      );
    }
    current.subjects = orderedSubjects([...current.subjects, record.subject]);
    if (record.parentPhone) current.parentPhones.add(record.parentPhone);
    current.locations.push(record.location);
  }

  return [...byUsername.values()].sort((a, b) => a.username.localeCompare(b.username, "ko"));
}

function sameStrings(actual: readonly unknown[] | undefined, expected: readonly string[]): boolean {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  return actual.every((value, index) => String(value) === expected[index]);
}

function enrollmentNeedsUpdate(enrollment: EnrollmentRow, account: RosterAccount): boolean {
  return (
    enrollment.grade !== account.grade ||
    enrollment.status !== "재원" ||
    !sameStrings(enrollment.subjects, account.subjects)
  );
}

function id(value: unknown): string {
  return String(value);
}

function isDuplicateKey(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000;
}

function printIdentities(label: string, identities: string[]): void {
  const sorted = unique(identities.map(safeForLog)).sort((a, b) => a.localeCompare(b, "ko"));
  console.log(`- ${label}: ${sorted.length}명${sorted.length ? ` — ${sorted.join(", ")}` : ""}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  console.log(args.apply ? "[APPLY] 실제 DB 반영 모드" : "[DRY RUN] 읽기 전용 미리보기");
  console.log(`입력 파일: ${safeForLog(path.basename(args.filePath))}`);

  // 취약한/조작된 XLSX 입력을 받지 않도록 사용자가 첨부한 검토본만 허용한다.
  assertReviewedWorkbook(args.filePath);
  const records = readWorkbook(args.filePath);
  const roster = buildRoster(records);
  const dualSubject = roster.filter((account) => account.subjects.length > 1);
  const normalizedSuffixes = records.filter((record) => record.nameSuffixRemoved);

  console.log(`\n엑셀: 수강 행 ${records.length}건 → 학생 ${roster.length}명`);
  for (const subject of TARGET_SUBJECTS) {
    console.log(`- ${subject}: ${records.filter((record) => record.subject === subject).length}건`);
  }
  printIdentities(
    "복수 수강",
    dualSubject.map((account) => `${account.username}(${account.subjects.join("+")})`)
  );
  printIdentities(
    "전화 끝 4자리 확인 후 이름 접미사 제거",
    normalizedSuffixes.map((record) => record.username)
  );

  await dbConnect();
  console.log("\nMongoDB 연결 완료");

  const targetTerm = (await Term.findOne({ name: TARGET_TERM_NAME }).lean()) as TermRow | null;
  const existingStudents = (await Student.find({
    username: { $in: roster.map((account) => account.username) },
  })
    .select({ _id: 1, name: 1, username: 1 })
    .lean()) as StudentRow[];
  const studentByUsername = new Map(existingStudents.map((student) => [student.username, student]));
  const reused = roster.filter((account) => studentByUsername.has(account.username));
  const toCreate = roster.filter((account) => !studentByUsername.has(account.username));

  const invalidNewAccounts = toCreate.filter((account) => account.parentPhones.size !== 1);
  if (invalidNewAccounts.length) {
    printIdentities(
      "신규 계정 중 부모 전화번호가 없거나 서로 충돌",
      invalidNewAccounts.map((account) => account.username)
    );
    throw new Error("신규 계정 비밀번호를 안전하게 정할 수 없어 중단했습니다.");
  }

  const mismatchedExistingNames = reused.filter(
    (account) => studentByUsername.get(account.username)?.name !== account.name
  );

  let currentEnrollments: EnrollmentRow[] = [];
  if (targetTerm) {
    currentEnrollments = (await Enrollment.find({ term: targetTerm._id })
      .select({
        _id: 1,
        student: 1,
        grade: 1,
        subjects: 1,
        status: 1,
        schoolExamResults: 1,
      })
      .lean()) as EnrollmentRow[];
  }

  const enrollmentByStudentId = new Map<string, EnrollmentRow>();
  for (const enrollment of currentEnrollments) {
    const studentId = id(enrollment.student);
    if (enrollmentByStudentId.has(studentId)) {
      throw new Error(`대상 학기에 학생 ${safeForLog(studentId)}의 Enrollment가 중복되어 있습니다.`);
    }
    enrollmentByStudentId.set(studentId, enrollment);
  }

  const rosterExistingStudentIds = new Set(reused.map((account) => id(studentByUsername.get(account.username)!._id)));
  const staleEnrollments = currentEnrollments.filter(
    (enrollment) => !rosterExistingStudentIds.has(id(enrollment.student))
  );
  const staleStudentIds = unique(staleEnrollments.map((enrollment) => id(enrollment.student)));
  const staleStudents = staleStudentIds.length
    ? ((await Student.find({ _id: { $in: staleStudentIds } })
        .select({ _id: 1, name: 1, username: 1 })
        .lean()) as StudentRow[])
    : [];
  const staleStudentById = new Map(staleStudents.map((student) => [id(student._id), student]));
  const staleIdentities = staleEnrollments.map(
    (enrollment) => staleStudentById.get(id(enrollment.student))?.username ?? `학생ID:${id(enrollment.student)}`
  );

  const enrollmentCreates = roster.filter((account) => {
    const student = studentByUsername.get(account.username);
    return !student || !enrollmentByStudentId.has(id(student._id));
  });
  const enrollmentUpdates = reused.filter((account) => {
    const student = studentByUsername.get(account.username)!;
    const enrollment = enrollmentByStudentId.get(id(student._id));
    return !!enrollment && enrollmentNeedsUpdate(enrollment, account);
  });
  const enrollmentUnchanged = reused.filter((account) => {
    const student = studentByUsername.get(account.username)!;
    const enrollment = enrollmentByStudentId.get(id(student._id));
    return !!enrollment && !enrollmentNeedsUpdate(enrollment, account);
  });

  console.log(`\n대상 학기: ${TARGET_TERM_NAME}`);
  if (!targetTerm) {
    console.log(`- 신규 생성: 반 ${TARGET_SUBJECTS.join(", ")} / 활성 / 기간·클리닉 날짜 비움`);
  } else {
    console.log(
      `- 기존 학기 재사용: 반은 정확히 3개로 조정, 활성=true, 기존 기간·클리닉 날짜(${targetTerm.clinicDates?.length ?? 0}일) 보존`
    );
  }
  printIdentities("기존 Student 재사용(문서 변경 없음)", reused.map((account) => account.username));
  printIdentities("새 Student 생성 예정", toCreate.map((account) => account.username));
  printIdentities(
    "기존 Student 이름 불일치(아이디 기준 재사용, 문서 변경 없음)",
    mismatchedExistingNames.map((account) => account.username)
  );
  printIdentities("Enrollment 신규", enrollmentCreates.map((account) => account.username));
  printIdentities("Enrollment 갱신", enrollmentUpdates.map((account) => account.username));
  printIdentities("Enrollment 변경 없음", enrollmentUnchanged.map((account) => account.username));
  printIdentities("명단 외 Enrollment 삭제", staleIdentities);

  if (targetTerm && staleEnrollments.length) {
    const withSchoolExams = staleEnrollments.filter(
      (enrollment) =>
        Array.isArray(enrollment.schoolExamResults) &&
        enrollment.schoolExamResults.length > 0
    );
    if (withSchoolExams.length) {
      throw new Error(
        `명단 외 Enrollment ${withSchoolExams.length}건에 학교 성적이 있어 삭제를 허용하지 않습니다.`
      );
    }
    const sessionCount = await Session.countDocuments({ term: targetTerm._id });
    if (sessionCount !== 0) {
      throw new Error(
        `${TARGET_TERM_NAME}에 Session ${sessionCount}건이 있어 명단 외 Enrollment 삭제를 허용하지 않습니다.`
      );
    }
    console.log("- 삭제 안전 확인: 대상 학기 Session 0건");
  }

  if (!args.apply) {
    console.log("\n[DRY RUN 완료] DB에 쓰지 않았습니다. 확인 후 --apply를 붙여 실행하세요.");
    return;
  }

  // 모든 검증과 bcrypt 계산을 쓰기보다 먼저 끝낸다.
  const passwordHashByUsername = new Map<string, string>();
  for (const account of toCreate) {
    const parentPhone = [...account.parentPhones][0];
    passwordHashByUsername.set(account.username, await bcrypt.hash(parentPhone, 10));
  }

  // 새 학기는 이전 학기에서 아무것도 복사하지 않는다. 기존 학기면 날짜 필드는 건드리지 않는다.
  let termDocument = await Term.findOne({ name: TARGET_TERM_NAME });
  let termCreated = false;
  if (!termDocument) {
    const latest = await Term.findOne().sort({ order: -1 }).select({ order: 1 }).lean();
    try {
      termDocument = await Term.create({
        name: TARGET_TERM_NAME,
        startDate: "",
        endDate: "",
        subjects: [...TARGET_SUBJECTS],
        clinicDates: [],
        active: false,
        schoolExamInput: true,
        order: (latest?.order ?? 0) + 1,
      });
      termCreated = true;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      termDocument = await Term.findOne({ name: TARGET_TERM_NAME });
    }
  }
  if (!termDocument) throw new Error(`${TARGET_TERM_NAME} Term을 만들거나 조회하지 못했습니다.`);

  // 명단 조정 중 학생 쓰기를 차단하고, 모든 검증이 끝난 뒤 다시 진행 상태로 연다.
  if (
    !sameStrings(termDocument.subjects, TARGET_SUBJECTS) ||
    termDocument.active !== false ||
    termDocument.schoolExamInput !== true
  ) {
    termDocument.subjects = [...TARGET_SUBJECTS];
    termDocument.active = false;
    termDocument.schoolExamInput = true;
    await termDocument.save();
  }
  targetStagedInactive = true;

  let studentsCreated = 0;
  const appliedStudentByUsername = new Map(studentByUsername);
  for (const account of toCreate) {
    const parentPhone = [...account.parentPhones][0];
    try {
      const created = await Student.create({
        name: account.name,
        username: account.username,
        password: passwordHashByUsername.get(account.username)!,
        passwordPlain: parentPhone,
      });
      appliedStudentByUsername.set(account.username, created as unknown as StudentRow);
      studentsCreated++;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const raced = (await Student.findOne({ username: account.username })
        .select({ _id: 1, name: 1, username: 1 })
        .lean()) as StudentRow | null;
      if (!raced) throw error;
      // 다른 실행이 먼저 만든 계정도 읽어 재사용할 뿐 수정하지 않는다.
      appliedStudentByUsername.set(account.username, raced);
    }
  }

  // 새 학생 ID까지 확정한 후 대상 학기만 다시 읽고, 실제 차이가 있는 행만 부분 갱신한다.
  const beforeEnrollmentApply = (await Enrollment.find({ term: termDocument._id })
    .select({
      _id: 1,
      student: 1,
      grade: 1,
      subjects: 1,
      status: 1,
      schoolExamResults: 1,
    })
    .lean()) as EnrollmentRow[];
  const beforeByStudentId = new Map<string, EnrollmentRow>();
  for (const enrollment of beforeEnrollmentApply) {
    const studentId = id(enrollment.student);
    if (beforeByStudentId.has(studentId)) {
      throw new Error(`대상 학기에 학생 ${safeForLog(studentId)}의 Enrollment가 중복되어 있습니다.`);
    }
    beforeByStudentId.set(studentId, enrollment);
  }

  let enrollmentsCreated = 0;
  let enrollmentsUpdated = 0;
  for (const account of roster) {
    const student = appliedStudentByUsername.get(account.username);
    if (!student) throw new Error(`${safeForLog(account.username)} Student를 조회하지 못했습니다.`);
    const current = beforeByStudentId.get(id(student._id));
    if (current && !enrollmentNeedsUpdate(current, account)) continue;

    const result = await Enrollment.updateOne(
      { term: termDocument._id, student: student._id },
      {
        // 학교시험 성적 등 Enrollment의 다른 필드는 보존한다.
        $set: { grade: account.grade, subjects: account.subjects, status: "재원" },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    if (result.upsertedCount) enrollmentsCreated++;
    else if (result.modifiedCount) enrollmentsUpdated++;
  }

  const rosterStudentIds = roster.map((account) => {
    const student = appliedStudentByUsername.get(account.username);
    if (!student) throw new Error(`${safeForLog(account.username)} Student ID가 없습니다.`);
    return student._id;
  });
  const rosterStudentIdSet = new Set(rosterStudentIds.map(id));
  const afterUpsert = (await Enrollment.find({ term: termDocument._id })
    .select({ _id: 1, student: 1, schoolExamResults: 1 })
    .lean()) as EnrollmentRow[];
  const staleAfterUpsert = afterUpsert.filter(
    (enrollment) => !rosterStudentIdSet.has(id(enrollment.student))
  );

  let enrollmentsDeleted = 0;
  if (staleAfterUpsert.length) {
    const withSchoolExams = staleAfterUpsert.filter(
      (enrollment) =>
        Array.isArray(enrollment.schoolExamResults) &&
        enrollment.schoolExamResults.length > 0
    );
    if (withSchoolExams.length) {
      throw new Error(
        `명단 외 Enrollment ${withSchoolExams.length}건에 학교 성적이 생겨 삭제를 중단했습니다.`
      );
    }
    // 삭제 직전에 다시 확인한다. Session은 조회만 하며 절대 이동/삭제하지 않는다.
    const sessionCount = await Session.countDocuments({ term: termDocument._id });
    if (sessionCount !== 0) {
      throw new Error(
        `${TARGET_TERM_NAME}에 Session ${sessionCount}건이 생겨 명단 외 Enrollment 삭제를 중단했습니다.`
      );
    }
    const deleted = await Enrollment.deleteMany({
      term: termDocument._id,
      _id: { $in: staleAfterUpsert.map((enrollment) => enrollment._id) },
    });
    enrollmentsDeleted = deleted.deletedCount;
  }

  // 아직 비활성인 상태에서 명단과 기능 설정을 먼저 검증한다.
  const [verifiedTerm, verifiedEnrollments] = await Promise.all([
    Term.findById(termDocument._id).lean(),
    Enrollment.find({ term: termDocument._id })
      .select({ _id: 1, student: 1, grade: 1, subjects: 1, status: 1 })
      .lean() as unknown as Promise<EnrollmentRow[]>,
  ]);
  if (
    !verifiedTerm ||
    verifiedTerm.active !== false ||
    verifiedTerm.schoolExamInput !== true ||
    !sameStrings(verifiedTerm.subjects, TARGET_SUBJECTS)
  ) {
    throw new Error("대상 학기의 반/활성 상태 사후 검증에 실패했습니다.");
  }
  if (verifiedEnrollments.length !== roster.length) {
    throw new Error(
      `Enrollment 사후 검증 실패: 기대 ${roster.length}명, 실제 ${verifiedEnrollments.length}명`
    );
  }
  const verifiedByStudentId = new Map(verifiedEnrollments.map((enrollment) => [id(enrollment.student), enrollment]));
  for (const account of roster) {
    const student = appliedStudentByUsername.get(account.username)!;
    const enrollment = verifiedByStudentId.get(id(student._id));
    if (!enrollment || enrollmentNeedsUpdate(enrollment, account)) {
      throw new Error(`${safeForLog(account.username)} Enrollment 사후 검증에 실패했습니다.`);
    }
  }

  // 모든 데이터 검증을 통과한 뒤에만 학생 입력을 다시 연다.
  termDocument.active = true;
  termDocument.schoolExamInput = true;
  await termDocument.save();
  targetStagedInactive = false;
  const activatedTerm = await Term.findById(termDocument._id)
    .select({ active: 1, schoolExamInput: 1 })
    .lean();
  if (!activatedTerm?.active || !activatedTerm.schoolExamInput) {
    throw new Error("대상 학기의 최종 진행 상태 검증에 실패했습니다.");
  }

  console.log("\n[APPLY 완료]");
  console.log(`- Term: ${termCreated ? "신규 생성" : "기존 학기 재사용"} / 활성 / 반 3개`);
  console.log(`- Student: 신규 ${studentsCreated}명 / 기존 계정 수정·삭제 0명`);
  console.log(`- Enrollment: 신규 ${enrollmentsCreated}명 / 갱신 ${enrollmentsUpdated}명 / 삭제 ${enrollmentsDeleted}명`);
  console.log(`- 최종 명단: ${verifiedEnrollments.length}명`);
  console.log("- 다른 학기 Term/Enrollment/Session 및 모든 기존 Student 문서는 변경하지 않았습니다.");
}

main()
  .catch((error) => {
    if (targetStagedInactive) {
      console.error(
        `\n안전 조치: '${TARGET_TERM_NAME}'은 입력 차단 상태로 남겨 두었습니다. 원인을 해결한 뒤 스크립트를 다시 실행하세요.`
      );
    }
    console.error(`\n실패: ${redactPhones(error instanceof Error ? error.message : error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
