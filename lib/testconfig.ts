import { TestConfig } from "./models";
import { isoDate } from "./date";

/** 특정 학기의 TestConfig 를 { "YYYY-MM-DD|과목": maxScore } 맵으로 반환. */
export async function buildMaxMap(termId: string): Promise<Record<string, number>> {
  const configs = await TestConfig.find({ term: termId }).lean();
  const map: Record<string, number> = {};
  for (const c of configs) {
    map[`${isoDate(c.date)}|${c.subject}`] = c.maxScore;
  }
  return map;
}
