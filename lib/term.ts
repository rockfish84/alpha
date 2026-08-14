import { Term } from "./models";
import { normalizeClinicDatesBySubject } from "./clinic-dates";

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
    active: !!t.active,
    schoolExamInput: !!t.schoolExamInput,
    order: (t.order ?? 0) as number,
  };
}
