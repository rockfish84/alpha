import { TestConfig } from "./models";
import { isoDate } from "./date";

/** 모든 TestConfig 를 { "YYYY-MM-DD|과목": maxScore } 맵으로 반환. */
export async function buildMaxMap(): Promise<Record<string, number>> {
  const configs = await TestConfig.find().lean();
  const map: Record<string, number> = {};
  for (const c of configs) {
    map[`${isoDate(c.date)}|${c.subject}`] = c.maxScore;
  }
  return map;
}
