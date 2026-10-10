// 학부모 계정 안내 문자의 전송 기록. (서버·클라이언트 공용)

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** 문자를 보낼 수 있는 휴대폰 번호인지 (/api/admin/notify 와 같은 기준) */
export const noticePhoneOk = (v: unknown) => /^01[016789]\d{7,8}$/.test(digits(v));

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
  return sent
    .filter((s) => noticePhoneOk(s.phone) && !failed.has(digits(s.phone)))
    .map((s) => s.id);
}

/**
 * 지금 학부모 번호로 안내를 보낸 시각 (ISO). 아니면 빈 문자열.
 * 번호가 바뀌었으면 새 번호로는 보내지 않은 것이다. 받은 번호가 없는 기록은 그대로 인정한다.
 */
export function noticeSentAtFor(
  parent: { noticeSentAt?: unknown; noticeSentTo?: unknown } | null | undefined,
  phone: unknown
): string {
  if (!parent?.noticeSentAt) return "";
  const at = new Date(parent.noticeSentAt as string | Date);
  if (Number.isNaN(at.getTime())) return "";
  const to = digits(parent.noticeSentTo);
  if (to && to !== digits(phone)) return "";
  return at.toISOString();
}

/** 전송 기록을 남기기 전에 만든 계정이라 보냈는지 알 수 없는지 */
export function noticeUnknown(
  parent: { noticeSentAt?: unknown; noticeTracked?: unknown } | null | undefined
): boolean {
  return !!parent && !parent.noticeSentAt && parent.noticeTracked !== true;
}

export type NoticeSkipReason = "account" | "password" | "phone";

/**
 * '전송'으로 기록할 계정을 고른다. 화면에 보였던 비밀번호·번호가 지금 값과 같아야 한다
 * (그 사이 재발급되거나 번호가 바뀌었다면 예전 값으로 보낸 것이므로 기록하지 않는다).
 */
export function planNoticeRecords(
  shown: Map<string, { password: string; phone: string }>,
  parents: { student: string; password: string }[],
  phones: Map<string, string>
): {
  recorded: { id: string; sentTo: string }[];
  skipped: { id: string; reason: NoticeSkipReason }[];
} {
  const byStudent = new Map(parents.map((p) => [p.student, p]));
  const recorded: { id: string; sentTo: string }[] = [];
  const skipped: { id: string; reason: NoticeSkipReason }[] = [];
  for (const [id, seen] of shown) {
    const parent = byStudent.get(id);
    const phone = phones.get(id) ?? "";
    if (!parent) skipped.push({ id, reason: "account" });
    else if (!seen.password || parent.password !== seen.password) {
      skipped.push({ id, reason: "password" });
    } else if (!noticePhoneOk(phone) || digits(seen.phone) !== digits(phone)) {
      skipped.push({ id, reason: "phone" });
    } else recorded.push({ id, sentTo: digits(phone) });
  }
  return { recorded, skipped };
}
