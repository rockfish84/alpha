import type { RosterRecord } from "./roster-excel";

export interface ImportRecord extends RosterRecord {
  /** 여러 시트를 올렸을 때 원본 위치를 구분하기 위한 시트 이름 */
  sheet?: string;
}

export interface ImportCandidate {
  key: string;
  name: string;
  phone: string;
  school: string;
  grade: string;
  subjects: string[];
  sources: string[];
  notes: string[];
}

export interface ImportInputError {
  source: string;
  reason: string;
}

const clean = (value: unknown, max = 200) =>
  String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export const normalizeRosterName = (value: unknown) =>
  clean(value, 80).replace(/\s/g, "");

export const normalizeRosterPhone = (value: unknown) =>
  String(value ?? "").replace(/\D/g, "").slice(0, 20);

export const rosterIdentityKey = (name: unknown, phone: unknown) =>
  `${normalizeRosterName(name)}\u0000${normalizeRosterPhone(phone)}`;

/**
 * 엑셀의 여러 행/시트에 반복된 학생을 이름+학부모 번호로 한 명으로 합친다.
 * 반은 합집합으로 만들고, 서로 다른 학교·학년은 자동으로 덮지 않고 메모에 남긴다.
 */
export function consolidateRosterRecords(records: ImportRecord[]): {
  candidates: ImportCandidate[];
  errors: ImportInputError[];
} {
  const byKey = new Map<string, ImportCandidate>();
  const errors: ImportInputError[] = [];

  for (const raw of records.slice(0, 5000)) {
    const line = Number.isFinite(Number(raw?.line)) ? Number(raw.line) : 0;
    const sheet = clean(raw?.sheet, 100);
    const source = [sheet, line ? `${line}행` : ""].filter(Boolean).join(" ") || "위치 미상";
    const name = normalizeRosterName(raw?.name);
    const phone = normalizeRosterPhone(raw?.phone);
    const school = clean(raw?.school, 100).replace(/\s/g, "");
    const grade = clean(raw?.grade, 20).replace(/\s/g, "");
    const subject = clean(raw?.subject, 200);

    if (!name) {
      errors.push({ source, reason: "학생 이름이 없습니다." });
      continue;
    }
    if (phone.length < 10) {
      errors.push({ source, reason: `${name}: 학부모 번호를 확인해 주세요.` });
      continue;
    }
    if (!subject) {
      errors.push({ source, reason: `${name}: 반명을 읽지 못했습니다.` });
      continue;
    }

    const key = rosterIdentityKey(name, phone);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, {
        key,
        name,
        phone,
        school,
        grade,
        subjects: [subject],
        sources: [source],
        notes: clean(raw?.note, 300) ? [clean(raw.note, 300)] : [],
      });
      continue;
    }

    if (!current.subjects.includes(subject)) current.subjects.push(subject);
    if (!current.sources.includes(source)) current.sources.push(source);
    const rowNote = clean(raw?.note, 300);
    if (rowNote && !current.notes.includes(rowNote)) current.notes.push(rowNote);
    if (!current.school && school) current.school = school;
    else if (school && current.school !== school) {
      const note = `학교 값이 다름: ${current.school} / ${school}`;
      if (!current.notes.includes(note)) current.notes.push(note);
    }
    if (!current.grade && grade) current.grade = grade;
    else if (grade && current.grade !== grade) {
      const note = `학년 값이 다름: ${current.grade} / ${grade}`;
      if (!current.notes.includes(note)) current.notes.push(note);
    }
  }

  if (records.length > 5000) {
    errors.push({ source: "파일", reason: "한 번에 최대 5,000행까지 처리할 수 있습니다." });
  }

  return {
    candidates: [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, "ko")),
    errors,
  };
}

/** 새 학생 아이디의 기본값. 기존 운영 방식인 이름+학교를 유지한다. */
export function rosterUsernameBase(candidate: Pick<ImportCandidate, "name" | "school" | "phone">) {
  const raw = `${candidate.name}${candidate.school}`.replace(/\s/g, "");
  return (raw || `${candidate.name}${candidate.phone.slice(-4)}`).slice(0, 36);
}

export function nextRosterUsername(base: string, taken: Set<string>): string {
  const safeBase = base.slice(0, 36) || "student";
  let value = safeBase;
  let suffix = 2;
  while (taken.has(value)) {
    const tail = String(suffix++);
    value = `${safeBase.slice(0, 40 - tail.length)}${tail}`;
  }
  taken.add(value);
  return value;
}
