// 수강신청 엑셀 → 명단 행. (서버·클라이언트 공용, 엑셀 라이브러리에 의존하지 않는다)
//
// 파일마다 제목 줄 수와 열 순서가 다르므로, 머리행을 찾아 "열 이름"으로 매핑한다.
// 그래야 새 양식이 와도 열 이름만 맞으면 그대로 읽힌다.

/** 시트를 2차원 배열로 읽은 것 (xlsx.utils.sheet_to_json(ws, { header: 1 })) */
export type SheetRows = unknown[][];

export interface RosterRecord {
  /** 시트에서 몇 번째 줄인지 (1부터. 오류를 짚어 주기 위함) */
  line: number;
  name: string;
  school: string;
  /** "중1" 처럼 학교급을 붙인 값. 학교나 학년을 못 읽으면 빈 문자열 */
  grade: string;
  /** 엑셀에 적힌 반 이름 (없으면 빈 문자열) */
  subject: string;
  /** 학부모 번호 (숫자만). 못 찾으면 빈 문자열 */
  phone: string;
  /** 사람이 확인해야 할 점 (번호 여러 개, 학년 없음 등) */
  note: string;
}

export interface ParseResult {
  records: RosterRecord[];
  /** 머리행에서 찾은 열 (없으면 -1) */
  columns: Record<string, number>;
  /** 읽지 못한 줄 */
  errors: { line: number; reason: string; raw: string }[];
}

/** 열 이름 후보. 앞쪽이 우선한다. */
const COLUMN_ALIASES: Record<string, string[]> = {
  name: ["학생명", "성명", "이름", "학생"],
  phone: ["부모핸드폰", "학부모핸드폰", "학부모연락처", "보호자연락처", "부모연락처", "학부모"],
  school: ["학교명", "학교"],
  grade: ["학년"],
  subject: ["반명", "반", "수업명", "강좌명", "과목"],
};

const text = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim();
const squeeze = (v: unknown): string => text(v).replace(/\s/g, "");

/**
 * 반 제목 줄인지. 한 시트에 여러 반이 들어 있는 명단은
 * "[확통]오현민T(일)A10-1(8/16)" 같은 줄로 반이 나뉜다.
 */
function looksLikeSectionTitle(cells: string[]): boolean {
  const filled = cells.filter(Boolean);
  if (filled.length !== 1) return false;
  const one = filled[0];
  return one.length >= 5 && /[[\]()]/.test(one);
}

/** 머리행을 찾는다. 이름 열과 (번호 또는 학교) 열이 함께 있는 줄이다. */
export function findHeader(rows: SheetRows): { index: number; columns: Record<string, number> } {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = (rows[i] ?? []).map(squeeze);
    const columns: Record<string, number> = {};
    for (const [key, names] of Object.entries(COLUMN_ALIASES)) {
      const at = cells.findIndex((c) => names.includes(c));
      if (at >= 0) columns[key] = at;
    }
    if (columns.name != null && (columns.phone != null || columns.school != null)) {
      return { index: i, columns };
    }
  }
  return { index: -1, columns: {} };
}

/**
 * 학부모 번호를 고른다. 한 칸에 여러 개가 있으면 (모) 를 먼저 쓴다.
 *   "010-1111-2222(모)\n010-3333-4444(부)" → 01011112222
 */
export function pickParentPhone(raw: unknown): { phone: string; note: string } {
  const value = String(raw ?? "");
  if (!value.trim()) return { phone: "", note: "번호 없음" };

  const found = value
    .split(/[\r\n,;/]+/)
    .map((seg) => {
      const m = seg.match(/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/);
      if (!m) return null;
      const label = /모|엄마|母/.test(seg) ? "모" : /부|아빠|父/.test(seg) ? "부" : "";
      return { digits: m[0].replace(/\D/g, ""), label };
    })
    .filter(Boolean) as { digits: string; label: string }[];

  if (!found.length) return { phone: "", note: "번호를 읽지 못함" };
  const chosen =
    found.find((f) => f.label === "모") ?? found.find((f) => !f.label) ?? found[0];
  const note =
    found.length > 1
      ? `번호 ${found.length}개 중 ${chosen.label || "무표기"} 선택`
      : chosen.label === "부"
      ? "부 번호 (모 없음)"
      : "";
  return { phone: chosen.digits, note };
}

/** 학교 이름 끝 글자로 학교급을 정해 "중1" 같은 학년을 만든다. */
export function gradeOf(school: string, year: unknown): string {
  const n = squeeze(year).replace(/[^\d]/g, "");
  if (!n) return "";
  const s = squeeze(school);
  const level = s.endsWith("고") ? "고" : s.endsWith("중") ? "중" : s.endsWith("초") ? "초" : "";
  return level ? `${level}${n}` : n;
}

/** 시트 2차원 배열 → 명단 행 */
export function parseRoster(rows: SheetRows): ParseResult {
  const { index, columns } = findHeader(rows);
  if (index < 0) {
    return {
      records: [],
      columns: {},
      errors: [
        {
          line: 0,
          reason: "머리행(학생명·부모핸드폰 등)을 찾지 못했습니다.",
          raw: "",
        },
      ],
    };
  }

  const records: RosterRecord[] = [];
  const errors: ParseResult["errors"] = [];
  const at = (row: unknown[], key: string) =>
    columns[key] != null ? row[columns[key]] : "";

  // 머리행 위의 제목 줄이 첫 반 이름인 경우가 있다 ([공수2]오현민T… → 아래 학생들의 반)
  let section = "";
  for (let i = 0; i < index; i++) {
    const cells = (rows[i] ?? []).map(text);
    if (looksLikeSectionTitle(cells)) section = cells.filter(Boolean)[0];
  }

  for (let i = index + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const line = i + 1;
    const cells = row.map(text);

    // 중간에 끼어 있는 반 제목 줄 → 아래 학생들의 반이 된다
    if (looksLikeSectionTitle(cells)) {
      section = cells.filter(Boolean)[0];
      continue;
    }

    const name = squeeze(at(row, "name"));
    if (!name) continue; // 빈 줄·합계 줄
    // 머리행이 중간에 다시 나오는 파일도 있다
    if (COLUMN_ALIASES.name.includes(name)) continue;

    const school = squeeze(at(row, "school"));
    const { phone, note } = pickParentPhone(at(row, "phone"));
    const grade = gradeOf(school, at(row, "grade"));
    // 반명 열이 있으면 그 값, 없으면 제목 줄에서 읽은 반
    const subject = text(at(row, "subject")) || section;

    if (!phone) {
      errors.push({
        line,
        reason: note || "학부모 번호가 없습니다.",
        raw: `${name} ${school}`.trim(),
      });
      continue;
    }

    const notes = [note];
    if (!school) notes.push("학교 없음");
    if (!grade) notes.push("학년 없음");

    records.push({
      line,
      name,
      school,
      grade,
      subject,
      phone,
      note: notes.filter(Boolean).join(" · "),
    });
  }

  return { records, columns, errors };
}
