import { Term } from "./models";

/** 현재 활성 학기 (없으면 가장 최신). */
export async function getActiveTerm() {
  let t = await Term.findOne({ active: true }).lean();
  if (!t) t = await Term.findOne().sort({ order: -1, createdAt: -1 }).lean();
  return t;
}

/** termId 로 학기 조회, 없으면 활성 학기로 폴백. */
export async function resolveTerm(termId?: string | null) {
  if (termId) {
    try {
      const t = await Term.findById(termId).lean();
      if (t) return t;
    } catch {
      /* 잘못된 id 는 무시하고 활성 학기로 */
    }
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
    active: !!t.active,
    order: (t.order ?? 0) as number,
  };
}
