// 클리닉 날짜는 "YYYY-MM-DD" 문자열로 다루고, DB에는 UTC 자정 Date 로 저장한다.
// (서버 타임존과 무관하게 날짜가 밀리지 않도록 항상 UTC 기준으로 변환한다.)

export function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function isoDate(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}
