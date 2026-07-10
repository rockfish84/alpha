import { TestConfig } from "./models";
import { isoDate } from "./date";

/** 특정 학기의 TestConfig 를 { "YYYY-MM-DD|과목": maxScore } 맵으로 반환. */
export async function buildMaxMap(termId: string): Promise<Record<string, number>> {
  const configs = await TestConfig.find({ term: termId }).lean();
  const map: Record<string, number> = {};
  for (const c of configs) {
    map[`${isoDate(c.date)}|${c.subject}`] = c.maxScore ?? 10;
  }
  return map;
}

/** 만점 + 문항 맵을 함께 반환. */
export async function buildTestMaps(
  termId: string
): Promise<{ max: Record<string, number>; detail: Record<string, string> }> {
  const configs = await TestConfig.find({ term: termId }).lean();
  const max: Record<string, number> = {};
  const detail: Record<string, string> = {};
  for (const c of configs) {
    const key = `${isoDate(c.date)}|${c.subject}`;
    max[key] = c.maxScore ?? 10;
    if (c.detail) detail[key] = c.detail;
  }
  return { max, detail };
}
