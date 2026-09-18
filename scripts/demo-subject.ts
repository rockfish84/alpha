/**
 * 디버깅용 예시 반 "대수" 를 2026 2학기에 만든다.
 *   - 학생 15명 (아이디 demo01~demo15, 비밀번호 1234)
 *   - 클리닉 10회차 + 회차마다 답안 키(10문항, 유형 20종) + 학생 답안 자동 채점
 *   - 시험지·답지는 이미 올라간 공수2_8월1일 PDF를 "참조"로 재사용 (용량 중복 없음)
 *
 *   npx tsx scripts/demo-subject.ts             # DRY RUN
 *   npx tsx scripts/demo-subject.ts --apply     # 생성
 *   npx tsx scripts/demo-subject.ts --remove    # 예시 데이터 전부 삭제
 */
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { dbConnect } from "../lib/db";
import {
  Bookmark,
  Enrollment,
  Parent,
  Session,
  Student,
  Term,
  TestConfig,
} from "../lib/models";
import { toDate } from "../lib/date";
import {
  blankQuestion,
  distributePoints,
  gradeAnswers,
  questionLabel,
  type TestQuestion,
} from "../lib/grading";
import { FILE_BUCKET } from "../lib/files";

const TERM_NAME = "2026 2학기";
const SUBJECT = "대수";
const USER_PREFIX = "demo";
const STUDENT_COUNT = 15; // 기본 예시 학생 수 (+ 문자 테스트 계정 5명)
const APPLY = process.argv.includes("--apply");
const REMOVE = process.argv.includes("--remove");

/** 회차 (오늘 이전의 학기 클리닉 날짜 10개) */
const DATES = [
  "2026-08-15", "2026-08-16", "2026-08-22", "2026-08-23", "2026-08-29",
  "2026-08-30", "2026-09-05", "2026-09-06", "2026-09-12", "2026-09-13",
];

const TYPES = [
  "다항식의 연산", "나머지정리", "인수분해", "복소수", "이차방정식",
  "이차방정식의 판별식", "근과 계수의 관계", "이차함수의 최대·최소", "삼차방정식", "연립방정식",
  "일차부등식", "이차부등식", "절대부등식", "경우의 수", "순열",
  "조합", "집합의 연산", "명제와 조건", "함수의 대응", "유리함수·무리함수",
];

const DIFFICULTIES = ["최상", "상", "중", "하", "최하"] as const;

const NAMES = [
  "강민서", "고은채", "김도윤", "김서아", "나예준",
  "문지호", "박하린", "배시우", "서윤아", "송재인",
  "신하음", "오태민", "윤소율", "이건우", "임채원",
];

const SCHOOLS = [
  "둔산여고", "대전과학고", "충남고", "대덕고", "한밭고",
  "서대전고", "보문고", "대신고", "유성고", "노은고",
];

/** 실제 번호로 문자 테스트까지 해볼 계정 (비밀번호 = 그 번호) */
const TEST_ACCOUNTS = [
  { name: "김정훈", phone: "01093856618", school: "둔산여고", grade: "고2" },
  { name: "정은후", phone: "01043329180", school: "대전과학고", grade: "고2" },
  { name: "홍은기", phone: "01075933540", school: "충남고", grade: "고1" },
  { name: "오현민", phone: "01075450815", school: "대덕고", grade: "고2" },
  { name: "김경환", phone: "01032036189", school: "한밭고", grade: "고1" },
];

/** 회차별 답안 키. 8번은 부분문제 2개로 나눠 △ 채점도 확인할 수 있게 한다. */
function buildKey(round: number): TestQuestion[] {
  const list: TestQuestion[] = [];
  for (let no = 1; no <= 10; no++) {
    const q = blankQuestion(no);
    // 라운드마다 유형이 골고루 섞이도록 (전체 20종을 모두 사용)
    q.type = TYPES[(round * 7 + no * 3) % TYPES.length];
    q.difficulty = DIFFICULTIES[(round + no) % DIFFICULTIES.length];
    q.choices = no % 5 === 0 ? 0 : 5; // 5, 10번은 단답형
    if (q.choices === 0) {
      // 단답형 중 하나는 수식 기호가 들어간 답으로 (기호 표시·채점 확인용)
      q.answer =
        no === 5
          ? `${(round % 3) - 1} ≤ a ≤ ${round % 4 || 1}/2`
          : `${(round + no) % 9 || 3}`;
    } else {
      q.answer = String(((round + no) % 5) + 1);
    }
    list.push(q);
  }
  const base = list.find((q) => q.no === 8)!;
  return distributePoints([
    ...list.filter((q) => q.no !== 8),
    { ...base, part: 1, answer: base.choices ? "2" : "4" },
    { ...base, part: 2, answer: base.choices ? "5" : "7" },
  ]);
}

/** 학생마다 실력을 다르게 (0.42 ~ 0.92 정답 확률) */
const skillOf = (i: number) => 0.42 + ((i * 37) % 51) / 100;

/** 결정적 난수 (같은 결과가 재현되도록) */
function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

async function removeDemo(termId: any) {
  const students = await Student.find({ username: new RegExp(`^${USER_PREFIX}\\d+$`) }).lean();
  const ids = students.map((s) => s._id);
  const db = mongoose.connection.db!;
  const res = {
    sessions: (await Session.deleteMany({ term: termId, subject: SUBJECT })).deletedCount,
    configs: (await TestConfig.deleteMany({ term: termId, subject: SUBJECT })).deletedCount,
    files: (
      await db.collection(`${FILE_BUCKET}.files`).deleteMany({
        "metadata.subject": SUBJECT,
        "metadata.aliasOf": { $exists: true },
      })
    ).deletedCount,
    bookmarks: (await Bookmark.deleteMany({ term: termId, subject: SUBJECT })).deletedCount,
    enrollments: (await Enrollment.deleteMany({ student: { $in: ids } })).deletedCount,
    parents: (await Parent.deleteMany({ student: { $in: ids } })).deletedCount,
    students: (await Student.deleteMany({ _id: { $in: ids } })).deletedCount,
  };
  await Session.deleteMany({ student: { $in: ids } });
  const term = await Term.findById(termId);
  if (term) {
    term.subjects = (term.subjects ?? []).filter((s) => s !== SUBJECT);
    (term.clinicDatesBySubject as any)?.delete?.(SUBJECT);
    await term.save();
  }
  console.log("삭제 완료:", JSON.stringify(res));
}

async function main() {
  await dbConnect();
  const term = await Term.findOne({ name: TERM_NAME });
  if (!term) throw new Error(`${TERM_NAME} 학기를 찾을 수 없습니다.`);

  if (REMOVE) {
    if (!APPLY) {
      console.log("--remove 는 --apply 와 함께 실행해주세요.");
    } else {
      await removeDemo(term._id);
    }
    await mongoose.disconnect();
    return;
  }

  const db = mongoose.connection.db!;
  const paper = await db
    .collection(`${FILE_BUCKET}.files`)
    .findOne({ filename: /공수2_8월1일_테스트/, "metadata.aliasOf": { $exists: false } });
  const answer = await db
    .collection(`${FILE_BUCKET}.files`)
    .findOne({ filename: /공수2_8월1일_해설지/, "metadata.aliasOf": { $exists: false } });
  if (!paper || !answer) throw new Error("공수2_8월1일 시험지/해설지 원본을 찾을 수 없습니다.");

  console.log(`학기 ${term.name} 에 예시 반 "${SUBJECT}" 생성`);
  console.log(`  학생 ${STUDENT_COUNT}명 · 회차 ${DATES.length}개 · 유형 ${TYPES.length}종`);
  console.log(`  시험지/답지: ${paper.filename} / ${answer.filename} (참조 재사용)`);
  if (!APPLY) {
    console.log("\nDRY RUN 입니다. 실제로 만들려면 --apply 를 붙여 실행하세요.");
    await mongoose.disconnect();
    return;
  }

  // 1) 학기에 반·일정 추가
  if (!(term.subjects ?? []).includes(SUBJECT)) {
    term.subjects = [...(term.subjects ?? []), SUBJECT];
  }
  (term.clinicDatesBySubject as any).set(SUBJECT, DATES);
  term.clinicDates = [...new Set([...(term.clinicDates ?? []), ...DATES])].sort();
  await term.save();

  // 2) 학생 15명
  const students = [];
  const roster = [
    ...NAMES.map((name, i) => ({
      name,
      school: SCHOOLS[i % SCHOOLS.length],
      grade: i % 3 === 0 ? "고1" : "고2",
      secret: "1234",
    })),
    ...TEST_ACCOUNTS.map((t) => ({
      name: t.name,
      school: t.school,
      grade: t.grade,
      secret: t.phone, // 비밀번호 = 부모 번호 (주간 문자 발송 대상)
    })),
  ];

  for (let i = 0; i < roster.length; i++) {
    const person = roster[i];
    const username = `${USER_PREFIX}${String(i + 1).padStart(2, "0")}`;
    const grade = person.grade;
    let stu = await Student.findOne({ username });
    if (!stu) {
      stu = await Student.create({
        name: person.name,
        username,
        school: person.school,
        password: await bcrypt.hash(person.secret, 10),
        passwordPlain: person.secret,
      });
    } else {
      stu.name = person.name;
      stu.school = person.school;
      stu.passwordPlain = person.secret;
      stu.password = await bcrypt.hash(person.secret, 10);
      await stu.save();
    }
    await Enrollment.findOneAndUpdate(
      { term: term._id, student: stu._id },
      { $set: { grade, status: "재원" }, $addToSet: { subjects: SUBJECT } },
      { upsert: true }
    );
    students.push(stu);
  }

  // 3) 회차별 답안 키 + 자료 + 학생 답안
  for (const [round, date] of DATES.entries()) {
    const questions = buildKey(round);
    await TestConfig.findOneAndUpdate(
      { term: term._id, subject: SUBJECT, date: toDate(date) },
      { $set: { questions, maxScore: 100, answersPublished: true, detail: "" } },
      { upsert: true, setDefaultsOnInsert: true }
    );

    // 시험지·답지 참조 파일 (원본 chunks 재사용 → 용량 추가 없음)
    for (const [origin, kind] of [
      [paper, "paper"],
      [answer, "answer"],
    ] as const) {
      const exists = await db.collection(`${FILE_BUCKET}.files`).findOne({
        "metadata.subject": SUBJECT,
        "metadata.date": date,
        "metadata.kind": kind,
      });
      if (exists) continue;
      await db.collection(`${FILE_BUCKET}.files`).insertOne({
        length: origin.length,
        chunkSize: origin.chunkSize,
        uploadDate: new Date(),
        filename: origin.filename,
        contentType: origin.contentType,
        metadata: {
          term: term._id,
          subject: SUBJECT,
          date,
          kind,
          aliasOf: origin._id,
        },
      } as any);
    }

    const gradable = questions.filter(
      (q) => q.part || !questions.some((x) => x.no === q.no && x.part)
    );

    for (const [si, stu] of students.entries()) {
      const skill = skillOf(si);
      const answers: Record<string, string> = {};
      // 회차마다 한두 명은 결석(미응시)
      const absent = (si + round) % 23 === 0;
      if (!absent) {
        for (const q of gradable) {
          const label = questionLabel(q);
          const r = rand(round * 1000 + si * 37 + q.no * 7 + q.part);
          // 가끔은 아예 비워 두는(미제출) 문항도 만든다
          if (r > 0.96) continue;
          const correct = r < skill;
          if (correct) {
            answers[label] = q.answer;
            continue;
          }
          // 오답: 객관식은 다른 보기, 단답형은 학생마다 제각각인 값
          answers[label] = q.choices
            ? String(((Number(q.answer) + si) % q.choices) + 1)
            : q.answer.includes("≤")
            ? // 기호 답의 오답: 부등호 방향·값을 바꿔 본다 (일부는 <= 로 입력)
              si % 2 === 0
              ? q.answer.replace("≤", "<").replace("≤", "<")
              : `${si % 3} <= a <= ${(si % 4) + 1}/2`
            : String((q.no * 3 + si * 7 + round) % 17);
        }
      }
      const graded = gradeAnswers(questions, answers);
      const hasAnswers = Object.keys(answers).length > 0;
      await Session.findOneAndUpdate(
        { term: term._id, student: stu._id, subject: SUBJECT, date: toDate(date) },
        {
          $set: {
            submitted: true,
            attendance: absent ? "결석" : (si + round) % 17 === 0 ? "지각" : "출석",
            lateTime: (si + round) % 17 === 0 ? "10분" : "",
            absentReason: absent ? "개인 사정" : "",
            sources: ["교재"],
            qNumbers: (si + round) % 3 === 0 ? `${((si + round) % 9) + 1}번` : "",
            qTypes: (si + round) % 3 === 0 ? ["개념이 부족한 것 같음"] : [],
            hwDone: [1, 1, 1, 0.5, 0][(si + round) % 5],
            hwSsen: [1, 1, 0.5, 1, 0][(si + round * 2) % 5],
            testAnswers: answers,
            testScore: hasAnswers ? graded.score : null,
            testAuto: hasAnswers,
            testScale100: true,
            testMaxOverride: null,
          },
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }
    console.log(`  ${date} · 문항 ${gradable.length} · 학생 ${students.length}명 입력`);
  }

  console.log("\n완료. 관리자 화면에서 반 '대수' 를 확인하세요.");
  console.log("학생 로그인 예: demo01 / 1234 (학부모 탭도 같은 계정)");
  console.log("문자 테스트 계정:");
  TEST_ACCOUNTS.forEach((t, i) =>
    console.log(`  ${USER_PREFIX}${String(STUDENT_COUNT + i + 1).padStart(2, "0")} / ${t.phone} · ${t.name} (${t.school} ${t.grade})`)
  );
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
