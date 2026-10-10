// 학부모 계정 안내 문자의 전송 기록. (서버·클라이언트 공용)

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const phoneOk = (v: unknown) => /^01[016789]\d{7,8}$/.test(digits(v));

/**
 * 문자 발송 결과에서 실제로 학부모에게 나간 학생만 고른다.
 * - 테스트 모드(redirectedTo)면 학부모에게 간 것이 아니므로 아무도 고르지 않는다.
 * - 실패 목록에 번호가 있으면 뺀다. 형제가 같은 번호를 쓰면 둘 다 뺀다 (어느 쪽이 실패했는지 모름).
 * - 서버가 형식이 틀린 번호는 조용히 버리므로, 번호 형식이 맞는 학생만 센다.
 */
export function deliveredStudentIds(
  sent: { id: string; phone?: string }[],
  summary: { failedList?: { to: string }[]; redirectedTo?: string | null }
): string[] {
  if (summary.redirectedTo) return [];
  const failed = new Set((summary.failedList ?? []).map((f) => digits(f.to)));
  return sent.filter((s) => phoneOk(s.phone) && !failed.has(digits(s.phone))).map((s) => s.id);
}
