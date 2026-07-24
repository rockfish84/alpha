// 클라이언트/서버 공용 상수 & 타입 (서버 전용 모듈을 import 하지 않음).

/* ============================== THEME ============================== */
export const T = {
  bg: "#EDF0F5",
  surface: "#FFFFFF",
  ink: "#17233B",
  sub: "#586580",
  line: "#DEE4EE",
  primary: "#2C4A82",
  primarySoft: "#E6ECF7",
  accent: "#DFA02E",
  ok: "#2E9E6B",
  okSoft: "#E5F4EC",
  warn: "#CF8A2A",
  warnSoft: "#FAF0DE",
  bad: "#D2543F",
  badSoft: "#FBE7E2",
  muted: "#93A0B4",
};

export const FONT =
  "'Pretendard','Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',-apple-system,sans-serif";

/* ============================== FORM OPTIONS ============================== */
export const SOURCE_OPTS = [
  "교재",
  "쎈",
  "학교 프린트",
  "과제문제 재설명(지난 회차)",
  "개인 교재(수특 등)",
  "없음",
];

export const QTYPE_OPTS = [
  "설명을 들었으나 재설명이 필요함",
  "풀어보았지만 답에 도달하지 못함",
  "접근법이 떠오르지 않아 시도하지 못함",
  "풀었지만 다른 해법이 있는지 궁금함",
  "개념이 부족한 것 같음",
];

/* ============================== HELPERS ============================== */
export const md = (iso: string): string => {
  const [, m, d] = iso.split("-");
  return `${+m}/${+d}`;
};

export const attTone: Record<string, "ok" | "warn" | "bad"> = {
  출석: "ok",
  지각: "warn",
  결석: "bad",
};

/** 브라우저 로컬 타임존 기준 오늘 날짜 "YYYY-MM-DD". */
export function todayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate()
  ).padStart(2, "0")}`;
}

/** 날짜 목록에서 기본 선택 날짜: 오늘이 있으면 오늘, 없으면 가장 가까운 다가오는 날, 다 지났으면 마지막 날. */
export function pickDefaultDate(dates: string[]): string {
  if (!dates.length) return "";
  const sorted = [...dates].sort();
  const t = todayIso();
  if (sorted.includes(t)) return t;
  const upcoming = sorted.filter((d) => d >= t);
  return upcoming.length ? upcoming[0] : sorted[sorted.length - 1];
}

/* ============================== CLIENT TYPES ============================== */
export interface Student {
  id: string; // student 계정 id
  enrollmentId?: string; // 이 학기 등록 id (roster 수정/삭제용)
  name: string;
  username: string;
  password?: string; // 관리자 조회용 평문 (부모 번호)
  grade: string;
  status: "재원" | "퇴원";
  subjects: string[];
}

export interface TermInfo {
  id: string;
  name: string;
  active: boolean;
  clinicDates: string[];
  subjects: string[];
  grade?: string; // 학생 포털: 이 학기 내 학년
  startDate?: string;
  endDate?: string;
  order?: number;
}

export interface ClinicSession {
  id: string;
  studentId: string;
  subject: string;
  date: string; // YYYY-MM-DD
  submitted: boolean;
  attnAdmin: boolean; // 관리자가 직접 출석을 기록했는지 (학생 미제출이어도 출석 표시)
  attendance: "출석" | "지각" | "결석";
  lateTime: string;
  absentReason: string;
  sources: string[];
  sourcesEtc: string;
  qNumbers: string;
  qTypes: string[];
  qTypesEtc: string;
  request: string;
  hwDone: number | null; // 과제(프린트) 1(O) / 0.5(△) / 0(X) / null(미입력)
  hwSsen: number | null; // 과제(쎈) 1(O) / 0.5(△) / 0(X) / null(미입력)
  testScore: number | null;
  testMaxOverride: number | null; // 이 학생만 다른 만점 (없으면 반 기본값)
  testDetail: string; // 테스트 문항 (예: 3,6,9번)
  solved: string;
  adminNote: string; // 비고 / 특이사항
  max: number | null; // 유효 만점 (override > 반 설정 > 10)
}

export interface Me {
  role: "student" | "admin";
  id: string;
  name: string;
  terms?: TermInfo[]; // 학생: 등록된 학기들 (최신순)
}

export interface Stats {
  hwRate: number;
  testAvg: number;
  submittedCnt: number;
  attendedCnt: number;
  hwFullCnt: number; // 과제 완료(O)
  hwHalfCnt: number; // 과제 부분(△)
  hwMissCnt: number; // 과제 미수행(X)
  testRows: { date: string; pct: number; raw: number; max: number }[];
}

/** 학생 입력용 빈 세션 폼 초기값. */
export function blankSession(
  studentId: string,
  date: string,
  subject: string
): ClinicSession {
  return {
    id: "",
    studentId,
    subject,
    date,
    submitted: false,
    attnAdmin: false,
    attendance: "출석",
    lateTime: "",
    absentReason: "",
    sources: [],
    sourcesEtc: "",
    qNumbers: "",
    qTypes: [],
    qTypesEtc: "",
    request: "",
    hwDone: null,
    hwSsen: null,
    testScore: null,
    testMaxOverride: null,
    testDetail: "",
    solved: "",
    adminNote: "",
    max: null,
  };
}
