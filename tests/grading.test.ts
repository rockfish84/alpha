import test from "node:test";
import assert from "node:assert/strict";
import {
  DIFFICULTIES,
  FULL_SCORE,
  buildDistribution,
  buildQuestions,
  bucketIndex,
  applyMathShortcuts,
  distributePoints,
  isMultipleChoice,
  gradableQuestions,
  gradeAnswers,
  isAnswerCorrect,
  normalizeAnswer,
  normalizeAnswerMap,
  normalizeExcluded,
  normalizeQuestions,
  questionLabel,
  totalPoints,
  type TestQuestion,
} from "../lib/grading";

const q = (p: Partial<TestQuestion> & { no: number }): TestQuestion => ({
  part: 0,
  answer: "",
  points: 1,
  type: "",
  difficulty: "",
  choices: 5,
  ...p,
});

test("문항 이름은 부분문제를 8-(1) 형태로 만든다", () => {
  assert.equal(questionLabel({ no: 8 }), "8");
  assert.equal(questionLabel({ no: 8, part: 2 }), "8-(2)");
});

test("답안 비교는 공백·대소문자·전각·원문자를 무시한다", () => {
  assert.equal(normalizeAnswer(" ３ "), "3");
  assert.equal(normalizeAnswer("③"), "3");
  assert.equal(normalizeAnswer("A b"), "ab");
  assert.ok(isAnswerCorrect("③", "3"));
  assert.ok(isAnswerCorrect("x = 2", "x=2"));
});

test("복수 정답은 | 로 구분하고, 쉼표는 답 자체로 본다", () => {
  assert.ok(isAnswerCorrect("3", "3|③|three"));
  assert.ok(isAnswerCorrect("three", "3|③|three"));
  assert.ok(isAnswerCorrect("1,3", "1,3"));
  assert.equal(isAnswerCorrect("1", "1,3"), false);
});

test("빈 답안은 항상 오답이고, 정답이 비어 있으면 아무도 맞지 않는다", () => {
  assert.equal(isAnswerCorrect("", "3"), false);
  assert.equal(isAnswerCorrect("   ", "3"), false);
  assert.equal(isAnswerCorrect("3", ""), false);
});

test("부분문제가 있으면 주 문항 대신 부분문제만 채점한다", () => {
  const questions = [
    q({ no: 8, answer: "무시" }),
    q({ no: 8, part: 1, answer: "3", points: 4 }),
    q({ no: 8, part: 2, answer: "5", points: 6 }),
  ];
  assert.deepEqual(
    gradableQuestions(questions).map(questionLabel),
    ["8-(1)", "8-(2)"]
  );
  assert.equal(totalPoints(questions), 10);
});

test("자동 채점: 배점 합산 점수와 O/△/X 채점표", () => {
  const questions = [
    q({ no: 1, answer: "2", points: 10 }),
    q({ no: 2, answer: "5", points: 10 }),
    q({ no: 3, part: 1, answer: "3", points: 5 }),
    q({ no: 3, part: 2, answer: "7", points: 5 }),
  ];
  const r = gradeAnswers(questions, {
    "1": "2", // 정답
    "2": "4", // 오답
    "3-(1)": "3", // 정답
    "3-(2)": "9", // 오답 → 3번은 △
  });
  assert.equal(r.max, 100);
  assert.equal(r.score, 50); // 30점 중 15점 → 100점 만점 환산 50점
  assert.equal(r.pct, 50);
  assert.deepEqual(r.marks, { 1: "O", 2: "X", 3: "△" });
});

test("아무 답도 쓰지 않은 문항은 채점표에서 미응시(-)", () => {
  const r = gradeAnswers([q({ no: 1, answer: "2" })], {});
  assert.deepEqual(r.marks, { 1: "-" });
  assert.equal(r.score, 0);
  assert.equal(r.answeredCount, 0);
});

test("문항 정규화: 잘못된 항목은 버리고 중복 문항은 하나만 남긴다", () => {
  const normalized = normalizeQuestions([
    { no: 2, answer: "3", points: "4", choices: "5", difficulty: "상" },
    { no: 2, answer: "중복" },
    { no: 0 },
    { no: "x" },
    { no: 1, difficulty: "아주 어려움" },
  ]);
  assert.deepEqual(normalized.map((x) => x.no), [1, 2]);
  assert.equal(normalized[0].difficulty, "");
  assert.equal(normalized[1].points, 4);
  assert.equal(normalized[1].answer, "3");
});

test("학생 답안 맵은 존재하는 문항 키만 남기고 빈 값은 버린다", () => {
  const questions = [q({ no: 1 }), q({ no: 2, part: 1 }), q({ no: 2, part: 2 })];
  assert.deepEqual(
    normalizeAnswerMap({ "1": " 3 ", "2-(1)": "", "2-(2)": "5", "9": "1" }, questions),
    { "1": "3", "2-(2)": "5" }
  );
});

test("기본 문항 수는 1..n 이고 상한을 넘지 않는다", () => {
  assert.equal(buildQuestions(10).length, 10);
  assert.equal(buildQuestions(0).length, 1);
  assert.equal(buildQuestions(999).length, 60);
});

test("새 테스트는 100점 만점으로 균등 배분된다 (10문항 = 각 10점)", () => {
  const qs = buildQuestions(10);
  assert.deepEqual(qs.map((q) => q.points), Array(10).fill(10));
  assert.equal(totalPoints(qs), FULL_SCORE);
});

test("문항 수가 100 으로 안 떨어져도 배점은 모두 같다", () => {
  for (const n of [3, 7, 9, 11]) {
    const points = buildQuestions(n).map((q) => q.points);
    assert.equal(new Set(points).size, 1, `${n}문항 배점이 제각각`);
  }
});

test("배점이 안 떨어져도 다 맞으면 정확히 100점", () => {
  for (const n of [3, 7, 9, 11]) {
    const qs = buildQuestions(n).map((q, i) => ({ ...q, answer: String(i + 1) }));
    const answers = Object.fromEntries(
      qs.map((q, i) => [questionLabel(q), String(i + 1)])
    );
    const all = gradeAnswers(qs, answers);
    assert.equal(all.score, 100, `${n}문항 만점`);
    assert.equal(all.max, 100);

    // 하나 틀리면 (n-1)/n 비율
    const { [questionLabel(qs[0])]: _drop, ...rest } = answers;
    const one = gradeAnswers(qs, rest);
    assert.equal(one.score, Math.round(((n - 1) / n) * 10000) / 100, `${n}문항 부분점수`);
  }
});

test("부분문제는 그 문항 몫을 다시 나눠 갖는다 (1-(1),1-(2) 각 5점)", () => {
  const qs = distributePoints([
    q({ no: 1, part: 1 }),
    q({ no: 1, part: 2 }),
    ...Array.from({ length: 9 }, (_, i) => q({ no: i + 2 })),
  ]);
  const points = Object.fromEntries(qs.map((x) => [questionLabel(x), x.points]));
  assert.equal(points["1-(1)"], 5);
  assert.equal(points["1-(2)"], 5);
  assert.equal(points["2"], 10);
  assert.equal(points["10"], 10);
  assert.equal(totalPoints(qs), FULL_SCORE);
});

test("부분문제가 있는 주 문항 행은 0점이고 채점에서도 빠진다", () => {
  const qs = distributePoints([q({ no: 1 }), q({ no: 1, part: 1 }), q({ no: 1, part: 2 })]);
  const main = qs.find((x) => x.no === 1 && !x.part);
  assert.equal(main?.points, 0);
  assert.deepEqual(gradableQuestions(qs).map(questionLabel), ["1-(1)", "1-(2)"]);
  assert.equal(totalPoints(qs), FULL_SCORE);
});

test("난이도는 최상·상·중·하·최하 5단계", () => {
  assert.deepEqual(DIFFICULTIES, ["최상", "상", "중", "하", "최하"]);
  assert.equal(normalizeQuestions([{ no: 1, difficulty: "최상" }])[0].difficulty, "최상");
  assert.equal(normalizeQuestions([{ no: 1, difficulty: "어려움" }])[0].difficulty, "");
});

test("수식 기호는 표기가 달라도 같은 답으로 본다", () => {
  assert.equal(normalizeAnswer("0 ≤ a ≤ 3/4"), "0<=a<=3/4");
  assert.ok(isAnswerCorrect("0<=a<=3/4", "0 ≤ a ≤ 3/4"));
  assert.ok(isAnswerCorrect("sqrt2", "√2"));
  assert.ok(isAnswerCorrect("x != 1", "x ≠ 1"));
  assert.ok(isAnswerCorrect("(-inf,0)", "(-∞,0)"));
  assert.ok(isAnswerCorrect("x^2", "x²"));
});

test("키보드 약어는 커서 앞의 글자만 기호로 바꾼다", () => {
  assert.deepEqual(applyMathShortcuts("0<="), { value: "0≤", caret: 2 });
  assert.deepEqual(applyMathShortcuts("x^2"), { value: "x²", caret: 2 });
  assert.deepEqual(applyMathShortcuts("sqrt"), { value: "√", caret: 1 });
  // 약어가 아니면 그대로
  assert.deepEqual(applyMathShortcuts("3"), { value: "3", caret: 1 });
});

test("문제 형태는 보기 수로 구분한다 (0 = 단답형)", () => {
  assert.equal(isMultipleChoice(q({ no: 1, choices: 5 })), true);
  assert.equal(isMultipleChoice(q({ no: 1, choices: 0 })), false);
});

test("점수 분포 구간은 100~91 / 90~71 / 70~51 / 50~31 / 30~0", () => {
  assert.equal(bucketIndex(100), 0);
  assert.equal(bucketIndex(91), 0);
  assert.equal(bucketIndex(90), 1);
  assert.equal(bucketIndex(71), 1);
  assert.equal(bucketIndex(51), 2);
  assert.equal(bucketIndex(31), 3);
  assert.equal(bucketIndex(0), 4);
  assert.deepEqual(buildDistribution([100, 95, 80, 60, 40, 10]), [2, 1, 1, 1, 1]);
});

test("제외 문항은 만점에서 빠지고 남은 문항으로 100점을 다시 나눈다", () => {
  // 10문항 × 10점. 4·7번을 이 학생만 안 풀면 남은 8문항이 각 12.5점이 된다.
  const questions = buildQuestions(10).map((x, i) =>
    ({ ...x, answer: String((i % 5) + 1) })
  );
  const answers: Record<string, string> = {};
  for (const x of questions) answers[questionLabel(x)] = x.answer;

  const all = gradeAnswers(questions, answers);
  assert.equal(all.score, FULL_SCORE);

  // 제외한 두 문항을 틀려도(비워도) 100점
  const partial = { ...answers, "4": "", "7": "" };
  const graded = gradeAnswers(questions, partial, ["4", "7"]);
  assert.equal(graded.score, FULL_SCORE);
  assert.deepEqual(graded.excluded.sort(), ["4", "7"]);
  assert.equal(graded.marks[4], "/");
  assert.equal(graded.marks[7], "/");

  // 남은 8문항 중 하나를 틀리면 12.5점이 깎인다
  const oneWrong = { ...partial, "2": "틀린답" };
  assert.equal(gradeAnswers(questions, oneWrong, ["4", "7"]).score, 87.5);
});

test("제외 문항은 미제출과 다르다 (미제출은 만점에 그대로 남는다)", () => {
  const questions = buildQuestions(10).map((x) => ({ ...x, answer: "1" }));
  const answers: Record<string, string> = {};
  for (const x of questions) answers[questionLabel(x)] = "1";
  answers["4"] = "";
  answers["7"] = "";

  // 그냥 비우면 10문항 기준 → 80점
  assert.equal(gradeAnswers(questions, answers).score, 80);
  // 제외하면 8문항 기준 → 100점
  assert.equal(gradeAnswers(questions, answers, ["4", "7"]).score, FULL_SCORE);
});

test("제외 목록은 그 회차에 있는 문항만 남긴다", () => {
  const questions = [q({ no: 1, answer: "1" }), q({ no: 2, part: 1, answer: "2" })];
  assert.deepEqual(
    normalizeExcluded(["1", "2-(1)", "99", "", null], questions).sort(),
    ["1", "2-(1)"]
  );
  // 부분문제가 있는 문항의 주 번호는 채점 대상이 아니므로 받아들이지 않는다
  assert.deepEqual(normalizeExcluded(["2"], questions), []);
});
