import { Term } from "./models";
import { normalizeClinicDatesBySubject } from "./clinic-dates";
import { normalizeClosedSubjects } from "./subject-status";
import { normalizeTypeOrder } from "./type-order";

/** 진행 중인 학기 중 가장 최신 학기 (없으면 전체에서 가장 최신). */
export async function getActiveTerm() {
  let t = await Term.findOne({ active: true })
    .sort({ order: -1, createdAt: -1 })
    .lean();
  if (!t) t = await Term.findOne().sort({ order: -1, createdAt: -1 }).lean();
  return t;
}

/** termId 로 학기 조회. ID를 생략한 경우에만 최신 진행 학기로 폴백. */
export async function resolveTerm(termId?: string | null) {
  if (termId) {
    try {
      const t = await Term.findById(termId).lean();
      if (t) return t;
    } catch {
      /* 잘못된 id */
    }
    return null;
  }
  return getActiveTerm();
}

export function serializeTerm(t: any) {
  return {
    id: String(t._id),
    name: t.name as string,
    startDate: (t.startDate ?? "") as string,
    endDate: (t.endDate ?? "") as string,
    subjects: (t.subjects ?? []) as string[],
    clinicDates: ((t.clinicDates ?? []) as string[]).slice().sort(),
    clinicDatesBySubject: normalizeClinicDatesBySubject(
      t.clinicDatesBySubject,
      (t.subjects ?? []) as string[]
    ),
    typeOrderBySubject: normalizeTypeOrder(t.typeOrderBySubject, (t.subjects ?? []) as string[]),
    closedSubjects: normalizeClosedSubjects(
      t.closedSubjects,
      (t.subjects ?? []) as string[]
    ),
    year: termYear(t),
    active: !!t.active,
    schoolExamInput: !!t.schoolExamInput,
    order: (t.order ?? 0) as number,
  };
}

/**
 * 학년도를 고른다. 따로 지정하지 않았으면 이름이나 시작일에서 연도를 읽는다.
 * (학년도가 같으면 진급 없음, 1년 차이면 한 학년 올림)
 */
export function termYear(t: {
  year?: number | null;
  name?: string;
  startDate?: string;
}): number {
  if (t.year && t.year > 1900) return t.year;
  const fromName = /(20\d{2})/.exec(t.name ?? "")?.[1];
  if (fromName) return Number(fromName);
  const fromDate = /(20\d{2})/.exec(t.startDate ?? "")?.[1];
  if (fromDate) return Number(fromDate);
  return new Date().getFullYear();
}
