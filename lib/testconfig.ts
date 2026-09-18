import { TestConfig } from "./models";
import { isoDate } from "./date";

/** 특정 학기의 TestConfig 를 { "YYYY-MM-DD|과목": maxScore } 맵으로 반환. */
export async function buildMaxMap(termId: string): Promise<Record<string, number>> {
  // 답안 키(questions)는 무거우므로 만점 계산에는 가져오지 않는다.
  const configs = await TestConfig.find({ term: termId })
    .select({ subject: 1, date: 1, maxScore: 1 })
    .lean();
  const map: Record<string, number> = {};
  for (const c of configs) {
    map[`${isoDate(c.date)}|${c.subject}`] = c.maxScore ?? 100;
  }
  return map;
}

/** 만점 + 문항 + 주간 추가 메시지 맵을 함께 반환. */
export async function buildTestMaps(
  termId: string
): Promise<{
  max: Record<string, number>;
  detail: Record<string, string>;
  additionalMessage: Record<string, string>;
}> {
  const configs = await TestConfig.find({ term: termId })
    .select({ subject: 1, date: 1, maxScore: 1, detail: 1, additionalMessage: 1 })
    .lean();
  const max: Record<string, number> = {};
  const detail: Record<string, string> = {};
  const additionalMessage: Record<string, string> = {};
  for (const c of configs) {
    const key = `${isoDate(c.date)}|${c.subject}`;
    max[key] = c.maxScore ?? 100;
    if (c.detail) detail[key] = c.detail;
    if (c.additionalMessage) additionalMessage[key] = c.additionalMessage;
  }
  return { max, detail, additionalMessage };
}
