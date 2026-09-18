// 회차 테스트(답안 키) 조회·저장·자동 채점 (서버 전용).
import { Session, TestConfig } from "./models";
import { isoDate, toDate } from "./date";
import {
  gradeAnswers,
  normalizeQuestions,
  totalPoints,
  type AnswerMap,
  type TestQuestion,
} from "./grading";
import { normalizeRegions } from "./regions";
import type { QuestionRegion } from "./analysis-types";

/** Mongoose Map / lean 결과 / 일반 객체를 모두 답안 객체로 정규화. */
export function toAnswerMap(value: unknown): AnswerMap {
  if (!value) return {};
  const entries =
    value instanceof Map
      ? [...value.entries()]
      : typeof value === "object"
      ? Object.entries(value as Record<string, unknown>)
      : [];
  const out: AnswerMap = {};
  for (const [k, v] of entries) {
    if (typeof k !== "string" || k.startsWith("$")) continue;
    const s = String(v ?? "");
    if (s !== "") out[k] = s;
  }
  return out;
}

export interface ClientTestPaper {
  subject: string;
  date: string;
  maxScore: number;
  detail: string;
  additionalMessage: string;
  questions: TestQuestion[];
  answersPublished: boolean;
  questionRegions: QuestionRegion[];
}

export function serializeTestPaper(doc: any): ClientTestPaper {
  const questions = normalizeQuestions(doc?.questions ?? []);
  return {
    subject: (doc?.subject ?? "") as string,
    date: doc?.date ? isoDate(doc.date) : "",
    maxScore: (doc?.maxScore ?? 10) as number,
    detail: (doc?.detail ?? "") as string,
    additionalMessage: (doc?.additionalMessage ?? "") as string,
    questions,
    answersPublished: doc?.answersPublished !== false,
    questionRegions: normalizeRegions(doc?.questionRegions ?? []),
  };
}

/** 그 학기의 회차별 답안 키 맵 { "YYYY-MM-DD|과목": ClientTestPaper }. */
export async function buildPaperMap(
  termId: string,
  filter: { subject?: string; date?: string } = {}
): Promise<Record<string, ClientTestPaper>> {
  const query: Record<string, any> = { term: termId };
  if (filter.subject) query.subject = filter.subject;
  if (filter.date) query.date = toDate(filter.date);
  const docs = await TestConfig.find(query).lean();
  const map: Record<string, ClientTestPaper> = {};
  for (const d of docs) {
    const paper = serializeTestPaper(d);
    if (!paper.questions.length) continue;
    map[`${paper.date}|${paper.subject}`] = paper;
  }
  return map;
}

/**
 * 답안 키가 바뀌면 그 회차에 답안이 입력된 모든 학생을 다시 채점한다.
 * 답안이 없는 학생(= 미응시/수동 입력 회차)의 기존 점수는 건드리지 않는다.
 */
export async function regradeTest(
  termId: string,
  subject: string,
  dateIso: string,
  questions: TestQuestion[]
): Promise<number> {
  const docs = await Session.find({
    term: termId,
    subject,
    date: toDate(dateIso),
  }).lean();

  const ops = [];
  for (const d of docs) {
    const answers = toAnswerMap((d as any).testAnswers);
    if (!Object.keys(answers).length) continue;
    const { score } = gradeAnswers(questions, answers);
    ops.push({
      updateOne: {
        filter: { _id: d._id },
        update: {
          $set: {
            testScore: score,
            testAuto: true,
            testScale100: true,
            testMaxOverride: null,
          },
        },
      },
    });
  }
  if (ops.length) await Session.bulkWrite(ops as any);
  return ops.length;
}

/** 한 학생의 답안을 저장하고 즉시 채점한다. */
export async function saveAndGrade(
  termId: string,
  studentId: string,
  subject: string,
  dateIso: string,
  answers: AnswerMap,
  questions: TestQuestion[]
) {
  const result = gradeAnswers(questions, answers);
  const hasAnswers = Object.keys(answers).length > 0;
  const set: Record<string, any> = hasAnswers
    ? {
        testAnswers: answers,
        testScore: result.score,
        testAuto: true,
        testScale100: true,
        testMaxOverride: null,
      }
    : // 답안을 모두 지우면 자동 채점 점수도 함께 비운다.
      { testAnswers: {}, testScore: null, testAuto: false, testScale100: false };

  await Session.findOneAndUpdate(
    { term: termId, student: studentId, subject, date: toDate(dateIso) },
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return result;
}

/** 답안 키를 저장한다. 만점은 배점 합으로 자동 계산되고, 저장 즉시 재채점한다. */
export async function saveQuestions(
  termId: string,
  subject: string,
  dateIso: string,
  rawQuestions: unknown,
  extra: { answersPublished?: boolean } = {}
) {
  const questions = normalizeQuestions(rawQuestions);
  const set: Record<string, any> = { questions };
  if (questions.length) set.maxScore = totalPoints(questions) || 1;
  if (typeof extra.answersPublished === "boolean") {
    set.answersPublished = extra.answersPublished;
  }

  const doc = await TestConfig.findOneAndUpdate(
    { term: termId, subject, date: toDate(dateIso) },
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  const regraded = await regradeTest(termId, subject, dateIso, questions);
  return { paper: serializeTestPaper(doc), regraded };
}
