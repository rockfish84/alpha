// 분석 API 응답 타입 (클라이언트 공용 — 서버 전용 모듈을 import 하지 않는다).
import type { Difficulty, MarkSymbol } from "./grading";

export const FILE_KINDS = ["paper", "answer", "etc"] as const;
export type FileKind = (typeof FILE_KINDS)[number];
export const FILE_KIND_LABEL: Record<FileKind, string> = {
  paper: "시험지",
  answer: "답지",
  etc: "기타 자료",
};

export interface FileMeta {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  kind: FileKind;
  subject: string;
  date: string;
  uploadedAt: string;
}

/* ============================== 문항 위치 (시험지·해설지 잘라 보기) ==============================
   PDF 원본은 그대로 두고 "몇 페이지의 어느 영역인지"만 저장한다. 문항당 100바이트
   남짓이라 DB 용량을 거의 쓰지 않고, 볼 때 브라우저에서 그 영역만 잘라 그린다. */
export interface RegionRect {
  page: number; // 1부터
  x: number; // 페이지 좌상단 기준 (PDF pt)
  y: number;
  w: number;
  h: number;
  pw: number; // 페이지 전체 크기 (렌더 배율 계산용)
  ph: number;
}

export interface QuestionRegion {
  no: number; // 주 문항 번호
  kind: "paper" | "solution"; // 시험지 / 해설지
  fileId: string;
  rects: RegionRect[]; // 페이지를 넘어가면 여러 조각
  answerRect?: number; // "[정답]" 이 있는 조각 index
  answerY?: number; // 그 조각 안에서 정답·해설이 시작되는 y (페이지 좌표)
}

export interface ChoiceShare {
  choice: string; // 비교용 값 (정규화된 답)
  label: string; // 화면에 보여줄 원래 표기 (예: "0 ≤ a ≤ 3/4")
  count: number;
  ratio: number; // 0~100
  mine: boolean;
  correct: boolean; // 정답인 보기인지
}

export interface QuestionAnalysis {
  /** 이 문항의 시험지·해설지 위치 (오답 노트에서 문제/해설 보기) */
  regions?: QuestionRegion[];
  label: string;
  no: number;
  part: number;
  type: string;
  difficulty: Difficulty;
  points: number;
  answer: string;
  choices: number;
  correctRate: number;
  wrongRate: number;
  wrongRank: number;
  topWrongRate: number | null;
  myAnswer: string;
  myAnswered: boolean;
  /** 이 학생은 안 푸는 문항 (점수·오답 노트에서 빠진다) */
  myExcluded?: boolean;
  myCorrect: boolean;
  choiceShares: ChoiceShare[];
}

export interface TestAnalysis {
  subject: string;
  date: string;
  maxScore: number;
  questionCount: number;
  hasKey: boolean;
  /** 기출 회차 (유형별 강약점 집계에서 제외) */
  pastExam?: boolean;
  participants: number;
  avg: number | null;
  best: number | null;
  worst: number | null;
  distribution: number[];
  myScore: number | null;
  myPct: number | null;
  myRank: number | null;
  myAttendance: string;
  /** 그날 과제 수행 (1=O, 0.5=△, 0=X, null=입력 없음) */
  myHwDone: number | null;
  myHwSsen: number | null;
  myMarks: Record<number, MarkSymbol>;
  detail: string;
  files: FileMeta[];
  questions: QuestionAnalysis[];
}

/** 오답 노트 별표 (학생이 표시한 다시 볼 문항) */
export interface Bookmark {
  subject: string;
  date: string;
  label: string;
}

export const bookmarkKey = (b: {
  subject: string;
  date: string;
  label: string;
}) => `${b.subject}|${b.date}|${b.label}`;

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}
