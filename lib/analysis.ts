// 회차별 테스트 분석 (점수 분포·문항별 정오답률·상위 30% 오답률) — 서버 전용.
import { Session, TestConfig } from "./models";
import { isoDate } from "./date";
import { listTestFiles } from "./files";
import type {
  ChoiceShare,
  FileMeta,
  QuestionAnalysis,
  TestAnalysis,
} from "./analysis-types";
export type { ChoiceShare, QuestionAnalysis, TestAnalysis };

import {
  FULL_SCORE,
  acceptedAnswers,
  buildDistribution,
  gradeAnswers,
  isAnswerCorrect,
  normalizeAnswer,
  normalizeQuestions,
  questionLabel,
  totalPoints,
  type Difficulty,
  type MarkSymbol,
  type TestQuestion,
} from "./grading";
import { serializeTestPaper, toAnswerMap } from "./testpaper";
import { normalizeRegions } from "./regions";

const TOP_GROUP_RATIO = 0.3; // 상위 30%
const MIN_TOP_GROUP = 3; // 상위권 표본이 이보다 적으면 오답률을 내지 않는다
const NO_ANSWER = "미제출";
const ETC = "기타";
const MAX_SHARES = 6; // 답안 종류가 이보다 많으면 나머지는 "기타" 로 묶는다

type SessionLike = {
  student: unknown;
  subject: string;
  date: Date | string;
  attendance?: string;
  submitted?: boolean;
  attnAdmin?: boolean;
  testScore?: number | null;
  testMaxOverride?: number | null;
  testAnswers?: unknown;
};

function pctOf(score: number, max: number): number {
  if (!max) return 0;
  return Math.round((score / max) * 100);
}

function rankOf(myPct: number, allPcts: number[]): number {
  return allPcts.filter((p) => p > myPct).length + 1;
}

/**
 * 한 학생(studentId) 기준으로 그 학기의 회차별 테스트 분석을 만든다.
 * 반 전체 통계는 같은 회차의 모든 기록에서 계산한다.
 */
export async function buildTestAnalyses(
  termId: string,
  studentId: string,
  subjects: string[]
): Promise<TestAnalysis[]> {
  if (!subjects.length) return [];

  const [configs, sessions, files] = await Promise.all([
    TestConfig.find({ term: termId, subject: { $in: subjects } }).lean(),
    Session.find({ term: termId, subject: { $in: subjects } }).lean(),
    listTestFiles({ termId }),
  ]);

  const configByKey = new Map<string, any>();
  for (const c of configs) configByKey.set(`${isoDate(c.date)}|${c.subject}`, c);

  const filesByKey = new Map<string, FileMeta[]>();
  for (const f of files) {
    const key = `${f.date}|${f.subject}`;
    filesByKey.set(key, [...(filesByKey.get(key) ?? []), f]);
  }

  // 회차별로 세션을 모은다.
  const byKey = new Map<string, SessionLike[]>();
  for (const s of sessions as unknown as SessionLike[]) {
    const key = `${isoDate(s.date as Date)}|${s.subject}`;
    byKey.set(key, [...(byKey.get(key) ?? []), s]);
  }

  const out: TestAnalysis[] = [];

  for (const [key, rows] of byKey) {
    const [date, subject] = key.split("|");
    const config = configByKey.get(key);
    const questions: TestQuestion[] = normalizeQuestions(config?.questions ?? []);
    const published = !config || config.answersPublished !== false;
    const hasKey = questions.length > 0;
    if (hasKey && !published) continue; // 미공개 회차는 학생·학부모에게 숨긴다

    const mine = rows.find((r) => String(r.student) === String(studentId));
    const paperMax = hasKey
      ? FULL_SCORE
      : (config?.maxScore ?? FULL_SCORE) || FULL_SCORE;

    // 응시자: 답안 키가 있으면 답안 입력자, 없으면 점수 입력자
    type Scored = { row: SessionLike; score: number; pct: number; answers: Record<string, string> };
    const scored: Scored[] = [];
    for (const row of rows) {
      const answers = toAnswerMap(row.testAnswers);
      if (hasKey && Object.keys(answers).length) {
        const g = gradeAnswers(questions, answers);
        scored.push({ row, score: g.score, pct: g.pct, answers });
      } else if (!hasKey && row.testScore != null) {
        const max = row.testMaxOverride ?? paperMax;
        scored.push({
          row,
          score: Number(row.testScore),
          pct: pctOf(Number(row.testScore), max || 1),
          answers: {},
        });
      }
    }

    if (!scored.length) continue;

    const pcts = scored.map((s) => s.pct);
    const mineScored = scored.find(
      (s) => String(s.row.student) === String(studentId)
    );
    const myPct = mineScored ? mineScored.pct : null;

    // 상위 30% 그룹 (총점 기준)
    const sorted = [...scored].sort((a, b) => b.pct - a.pct);
    const topCount = Math.max(
      MIN_TOP_GROUP,
      Math.round(sorted.length * TOP_GROUP_RATIO)
    );
    const topGroup = sorted.length >= MIN_TOP_GROUP ? sorted.slice(0, Math.min(topCount, sorted.length)) : [];

    const allRegions = normalizeRegions(config?.questionRegions ?? []);
    const questionAnalyses: QuestionAnalysis[] = [];
    if (hasKey) {
      const gradable = questions.filter((q) => {
        const hasParts = questions.some((x) => x.no === q.no && x.part);
        return q.part || !hasParts;
      });
      for (const q of gradable) {
        const label = questionLabel(q);
        let correct = 0;
        const choiceCount = new Map<string, number>();
        // 같은 답이라도 표기가 다를 수 있어(0≤a / 0<=a) 비교는 정규화 값으로 하고,
        // 화면에는 학생이 실제로 쓴 표기를 보여 준다.
        const choiceLabel = new Map<string, string>();
        for (const s of scored) {
          const given = s.answers[label] ?? "";
          if (isAnswerCorrect(given, q.answer)) correct += 1;
          const norm = normalizeAnswer(given);
          const bucket = norm === "" ? NO_ANSWER : norm;
          choiceCount.set(bucket, (choiceCount.get(bucket) ?? 0) + 1);
          if (!choiceLabel.has(bucket)) {
            choiceLabel.set(bucket, bucket === NO_ANSWER ? NO_ANSWER : given.trim());
          }
        }
        const total = scored.length;
        const correctRate = Math.round((correct / total) * 100);

        let topWrongRate: number | null = null;
        if (topGroup.length >= MIN_TOP_GROUP) {
          const topWrong = topGroup.filter(
            (s) => !isAnswerCorrect(s.answers[label] ?? "", q.answer)
          ).length;
          topWrongRate = Math.round((topWrong / topGroup.length) * 100);
        }

        const myAnswer = mineScored ? mineScored.answers[label] ?? "" : "";
        const myNorm = normalizeAnswer(myAnswer);
        const myBucket = myNorm === "" ? NO_ANSWER : myNorm;

        // 답안 분포: 객관식은 보기 번호 순, 단답형은 정답 먼저.
        // 종류가 6개를 넘으면 적게 나온 답부터 "기타" 로 묶는다.
        const accepted = acceptedAnswers(q.answer);
        const isChoice = q.choices > 0;
        // 객관식은 보기 번호 순, 단답형은 정답을 맨 앞에 두고 많이 쓴 답 순으로.
        const must = isChoice
          ? Array.from({ length: q.choices }, (_, i) => String(i + 1))
          : [...new Set(accepted)].filter((a) => choiceCount.has(a));
        const used = new Set([...must]);
        const noAnswerCount = choiceCount.get(NO_ANSWER) ?? 0;

        const rest = [...choiceCount.entries()]
          .filter(([k]) => !used.has(k) && (isChoice ? k !== NO_ANSWER : true))
          .sort((a, b) => b[1] - a[1])
          .map(([k]) => k);

        // 객관식은 보기 뒤에 미제출을 따로 붙이고, 단답형은 개수 순서에 함께 섞는다.
        const head = isChoice
          ? [...must, ...(noAnswerCount > 0 ? [NO_ANSWER] : [])]
          : must;
        const slots = Math.max(0, MAX_SHARES - head.length);
        const kept = rest.slice(0, slots);
        let leftover = rest.slice(slots);

        // 내 답안이 흔치 않아 "기타" 로 묶이면 내 막대를 못 보게 된다.
        // 그럴 땐 마지막 칸을 내 답안에 양보한다.
        const minePending =
          !!mineScored &&
          !!myBucket &&
          choiceCount.has(myBucket) &&
          !head.includes(myBucket) &&
          !kept.includes(myBucket);
        if (minePending) {
          if (kept.length) leftover.unshift(kept.pop()!);
          kept.push(myBucket);
          leftover = leftover.filter((k) => k !== myBucket);
        }
        const shown = [...head, ...kept];

        // 화면에 보여줄 표기 (학생이 실제로 쓴 형태 우선)
        const answerLabels = q.answer
          .split("|")
          .map((a) => a.trim())
          .filter(Boolean);
        const labelOf = (choice: string) => {
          if (choice === NO_ANSWER || choice === ETC) return choice;
          const saved = choiceLabel.get(choice);
          if (saved) return saved;
          const asAnswer = answerLabels.find((a) => normalizeAnswer(a) === choice);
          return asAnswer ?? choice;
        };

        const toShare = (choice: string, count: number): ChoiceShare => ({
          choice,
          label: labelOf(choice),
          count,
          ratio: Math.round((count / total) * 100),
          mine: choice === myBucket,
          correct: choice !== NO_ANSWER && choice !== ETC && accepted.includes(choice),
        });

        const shares: ChoiceShare[] = shown.map((choice) =>
          toShare(choice, choiceCount.get(choice) ?? 0)
        );
        // 단답형에서 아무도 못 맞힌 정답은 맨 앞에 0% 로 보여 준다.
        if (!isChoice && accepted.length && !shares.some((c) => c.correct)) {
          shares.unshift(toShare(accepted[0], 0));
          if (shares.length > MAX_SHARES + 1) shares.pop();
        }
        if (leftover.length) {
          const count = leftover.reduce((a, k) => a + (choiceCount.get(k) ?? 0), 0);
          shares.push({
            ...toShare(ETC, count),
            mine: leftover.includes(myBucket),
          });
        }

        questionAnalyses.push({
          regions: allRegions.filter((r) => r.no === q.no),
          label,
          no: q.no,
          part: q.part,
          type: q.type,
          difficulty: q.difficulty,
          points: q.points,
          answer: q.answer,
          choices: q.choices,
          correctRate,
          wrongRate: 100 - correctRate,
          wrongRank: 0, // 아래에서 채운다
          topWrongRate,
          myAnswer,
          myAnswered: myNorm !== "",
          myCorrect: isAnswerCorrect(myAnswer, q.answer),
          choiceShares: shares,
        });
      }

      // 오답률 순위 (같은 오답률은 같은 순위)
      const byWrong = [...questionAnalyses].sort((a, b) => b.wrongRate - a.wrongRate);
      byWrong.forEach((qa) => {
        qa.wrongRank = byWrong.filter((x) => x.wrongRate > qa.wrongRate).length + 1;
      });
    }

    const myGrade =
      hasKey && mineScored ? gradeAnswers(questions, mineScored.answers) : null;

    out.push({
      subject,
      date,
      maxScore: paperMax,
      questionCount: questionAnalyses.length,
      hasKey,
      participants: scored.length,
      avg: Math.round(pcts.reduce((a, p) => a + p, 0) / pcts.length),
      best: Math.max(...pcts),
      worst: Math.min(...pcts),
      distribution: buildDistribution(pcts),
      myScore: mineScored ? mineScored.score : null,
      myPct,
      myRank: myPct == null ? null : rankOf(myPct, pcts),
      myAttendance:
        mine && (mine.submitted || mine.attnAdmin) ? String(mine.attendance ?? "") : "",
      myMarks: myGrade?.marks ?? {},
      detail: (config?.detail ?? "") as string,
      files: (filesByKey.get(key) ?? []).filter(() => published),
      questions: questionAnalyses,
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.subject.localeCompare(b.subject));
}

export { serializeTestPaper };
