"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Save,
  Upload,
  Users,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  ScanLine,
  ListOrdered,
  School,
} from "lucide-react";
import { T, md, pickGradingDate, todayIso, type Student } from "@/lib/constants";
import { api } from "@/lib/api";
import { getClinicDatesForSubject } from "@/lib/clinic-dates";
import { normalizeClosedSubjects, visibleSubjects } from "@/lib/subject-status";
import {
  ANSWER_ALT_SEPARATOR,
  DEFAULT_CHOICES,
  DEFAULT_QUESTION_COUNT,
  MATH_SYMBOLS,
  applyMathShortcuts,
  DIFFICULTIES,
  FULL_SCORE,
  MAX_PARTS_PER_QUESTION,
  MAX_QUESTION_COUNT,
  blankQuestion,
  buildQuestions,
  distributePoints,
  gradeAnswers,
  isMultipleChoice,
  questionLabel,
  sortQuestions,
  totalPoints,
  type AnswerMap,
  type Difficulty,
  type TestQuestion,
} from "@/lib/grading";
import {
  FILE_KIND_LABEL,
  formatFileSize,
  type FileKind,
  type FileMeta,
  type QuestionRegion,
} from "@/lib/analysis-types";
import { Btn, Card, Empty, Modal, Pill, SectionTitle, inputBase, lbl } from "./ui";
import { RegionMarker } from "./RegionMarker";

interface RosterRow {
  studentId: string;
  name: string;
  grade: string;
  status: string;
  attendance: string;
  attended: boolean;
  answers: AnswerMap;
  excluded?: string[];
  score: number | null;
  pct: number | null;
  manualScore: number | null;
  auto: boolean;
}

interface PaperData {
  subject: string;
  date: string;
  maxScore: number;
  detail: string;
  additionalMessage: string;
  questions: TestQuestion[];
  answersPublished: boolean;
  questionRegions: QuestionRegion[];
}

const cellBase: React.CSSProperties = {
  ...inputBase,
  padding: "6px 8px",
  fontSize: 13.5,
  textAlign: "center",
  borderRadius: 8,
};

const th: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 800,
  color: T.sub,
  borderBottom: `1px solid ${T.line}`,
  whiteSpace: "nowrap",
  background: "#F6F8FB",
};

/** 반별 유형(출제 단원) 순서 설정. 학생 화면의 "단원 순" 정렬에 쓰인다. */
function TypeOrderModal({
  open,
  termId,
  subject,
  onClose,
}: {
  open: boolean;
  termId: string;
  subject: string;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [used, setUsed] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !termId || !subject) return;
    let cancelled = false;
    setLoading(true);
    api
      .get(
        `/api/admin/typeorder?term=${termId}&subject=${encodeURIComponent(subject)}`
      )
      .then((d) => {
        if (cancelled) return;
        const order: string[] = d.order?.length ? d.order : d.used ?? [];
        setText(order.join("\n"));
        setUsed(d.used ?? []);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, termId, subject]);

  const lines = text
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
  const missing = used.filter((t) => !lines.includes(t));

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/api/admin/typeorder", { term: termId, subject, types: lines });
      onClose();
    } catch (e: any) {
      alert(e.message || "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`유형(단원) 순서 · ${subject}`} width={560}>
      <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.65, marginBottom: 12 }}>
        배우는 순서대로 <b>한 줄에 하나씩</b> 적어 주세요. 학생 화면의{" "}
        <b>유형별 강약점 → 단원 순</b> 정렬에 이 순서가 쓰입니다.
      </div>
      {loading ? (
        <div style={{ padding: 20, color: T.muted }}>불러오는 중…</div>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            style={{ ...inputBase, fontFamily: "inherit", lineHeight: 1.7, resize: "vertical" }}
            placeholder={"다항식의 연산\n나머지정리\n인수분해"}
          />
          {missing.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ ...lbl, marginBottom: 6 }}>
                아직 목록에 없는 유형 (누르면 추가)
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {missing.map((t) => (
                  <button
                    key={t}
                    onClick={() => setText((v) => (v.trim() ? `${v.trim()}\n${t}` : t))}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 999,
                      border: `1px solid ${T.line}`,
                      background: "#fff",
                      color: T.primary,
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    + {t}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              marginTop: 14,
            }}
          >
            <Btn variant="outline" size="sm" onClick={onClose}>
              취소
            </Btn>
            <Btn size="sm" onClick={save} disabled={saving}>
              <Save size={14} /> {saving ? "저장 중…" : "순서 저장"}
            </Btn>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ============================== 수식 입력 ==============================
   답에 ≤, √, ∞ 같은 기호를 쉽게 넣도록 팔레트와 키보드 약어를 제공한다.
   (<= 를 치면 ≤ 로 바뀌고, 채점은 두 표기를 같은 답으로 본다) */
type ActiveAnswer = { el: HTMLInputElement; no: number; part: number };

function MathPalette({
  onInsert,
  disabled,
}: {
  onInsert: (symbol: string) => void;
  disabled: boolean;
}) {
  const key: React.CSSProperties = {
    minWidth: 30,
    height: 30,
    borderRadius: 8,
    border: `1px solid ${T.line}`,
    background: "#fff",
    color: T.ink,
    fontSize: 15,
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.45 : 1,
    padding: "0 6px",
  };
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      {MATH_SYMBOLS.map((g) => (
        <div key={g.group} style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {g.items.map((sym) => (
            <button
              key={sym}
              type="button"
              // 버튼을 눌러도 입력칸 포커스가 풀리지 않게 한다
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInsert(sym)}
              disabled={disabled}
              title={`${sym} 넣기`}
              style={key}
            >
              {sym}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** 답 입력칸 (약어 → 기호 자동 변환) */
function AnswerInput({
  value,
  onChange,
  onFocus,
  onKeyDown,
  placeholder,
  style,
  dataRow,
  dataCol,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus: (el: HTMLInputElement) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  dataRow?: number;
  dataCol?: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);

  useEffect(() => {
    if (caretRef.current != null && ref.current) {
      ref.current.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }
  });

  return (
    <input
      ref={ref}
      value={value}
      placeholder={placeholder}
      style={style}
      data-krow={dataRow}
      data-kcol={dataCol}
      onKeyDown={onKeyDown}
      onFocus={(e) => onFocus(e.currentTarget)}
      onChange={(e) => {
        const raw = e.target.value;
        const pos = e.target.selectionStart ?? raw.length;
        const next = applyMathShortcuts(raw, pos);
        if (next.value !== raw) caretRef.current = next.caret;
        onChange(next.value);
      }}
    />
  );
}

/** 객관식 / 단답형 선택 토글. */
function ChoiceToggle({
  multiple,
  onChange,
}: {
  multiple: boolean;
  onChange: (multiple: boolean) => void;
}) {
  const item = (active: boolean): React.CSSProperties => ({
    padding: "5px 9px",
    borderRadius: 7,
    border: "none",
    cursor: "pointer",
    fontSize: 12.5,
    fontWeight: 700,
    fontFamily: "inherit",
    color: active ? T.primary : T.sub,
    background: active ? "#fff" : "transparent",
    boxShadow: active ? "0 1px 3px rgba(0,0,0,.08)" : "none",
  });
  return (
    <div
      style={{
        display: "inline-flex",
        background: "#E7ECF3",
        borderRadius: 9,
        padding: 2,
        gap: 2,
      }}
    >
      <button style={item(multiple)} onClick={() => onChange(true)}>
        객관식
      </button>
      <button style={item(!multiple)} onClick={() => onChange(false)}>
        단답형
      </button>
    </div>
  );
}

/* ============================== 답안 키 편집 ============================== */
function AnswerKeyEditor({
  questions,
  setQuestions,
  dirty,
  saving,
  onSave,
  published,
  setPublished,
  pastExam,
  setPastExam,
  pastExamSchool,
  setPastExamSchool,
  onOpenTypeOrder,
}: {
  questions: TestQuestion[];
  setQuestions: (next: TestQuestion[]) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  published: boolean;
  setPublished: (v: boolean) => void;
  pastExam: boolean;
  setPastExam: (v: boolean) => void;
  pastExamSchool: string;
  setPastExamSchool: (v: string) => void;
  onOpenTypeOrder: () => void;
}) {
  // 주 문항 번호 목록 (1..n)
  const mainNos = useMemo(
    () => [...new Set(questions.map((q) => q.no))].sort((a, b) => a - b),
    [questions]
  );
  const [addDraft, setAddDraft] = useState("");
  const [countDraft, setCountDraft] = useState(String(mainNos.length || DEFAULT_QUESTION_COUNT));
  useEffect(() => {
    setCountDraft(String(mainNos.length || DEFAULT_QUESTION_COUNT));
  }, [mainNos.length]);

  // 문번이 1,2,3… 로 이어지지 않는 회차 (예: 4, 7, 10번만 푼 날)
  const isSparse = mainNos.some((no, i) => no !== i + 1);

  /** 1~N번으로 다시 구성 (지금 문번 구성이 띄엄띄엄이면 한 번 확인) */
  const applyCount = (raw: string) => {
    const n = Math.max(1, Math.min(MAX_QUESTION_COUNT, Math.floor(Number(raw) || 0)));
    // 값을 그대로 두고 포커스만 빠진 경우엔 아무것도 하지 않는다
    // (4·7·10번처럼 골라 둔 구성이 실수로 지워지지 않도록)
    if (n === mainNos.length) {
      setCountDraft(String(mainNos.length));
      return;
    }
    if (
      isSparse &&
      !confirm(
        `문번을 1~${n}번으로 다시 만들까요?\n지금 구성(${mainNos.join(", ")}번)은 사라집니다.`
      )
    ) {
      setCountDraft(String(mainNos.length));
      return;
    }
    const kept = questions.filter((q) => q.no <= n);
    const existing = new Set(kept.map((q) => q.no));
    const added: TestQuestion[] = [];
    for (let i = 1; i <= n; i++) if (!existing.has(i)) added.push(blankQuestion(i));
    setQuestions(distributePoints([...kept, ...added]));
  };

  /** 문항 추가. 번호를 적으면 그 번호로, 비워 두면 마지막 번호 다음으로. */
  const addQuestion = (raw?: string) => {
    const typed = Math.floor(Number(raw ?? addDraft));
    const no =
      Number.isFinite(typed) && typed >= 1
        ? typed
        : (mainNos[mainNos.length - 1] ?? 0) + 1;
    if (no < 1 || no > MAX_QUESTION_COUNT) return;
    if (mainNos.includes(no)) {
      alert(`${no}번 문항은 이미 있습니다.`);
      return;
    }
    setQuestions(distributePoints([...questions, blankQuestion(no)]));
    setAddDraft("");
  };

  /** 지운 번호 (다시 넣기 쉽도록 표시) */
  const missingNos = (() => {
    const last = mainNos[mainNos.length - 1] ?? 0;
    const has = new Set(mainNos);
    return Array.from({ length: last }, (_, i) => i + 1).filter((n) => !has.has(n));
  })();

  /** 그 문번 전체 삭제 (부분문제까지). 남은 문항으로 배점을 다시 나눈다. */
  const removeQuestion = (no: number) => {
    if (mainNos.length <= 1) return;
    setQuestions(distributePoints(questions.filter((q) => q.no !== no)));
  };

  const patch = (no: number, part: number, p: Partial<TestQuestion>) =>
    setQuestions(
      questions.map((q) => (q.no === no && q.part === part ? { ...q, ...p } : q))
    );

  /** 부분문제 추가: 처음 누르면 (1)(2) 로 나뉘고, 이후에는 한 개씩 늘어난다. */
  const addPart = (no: number) => {
    const parts = questions.filter((q) => q.no === no && q.part);
    if (!parts.length) {
      const base = questions.find((q) => q.no === no && !q.part);
      const seed = base ?? blankQuestion(no);
      setQuestions(
        distributePoints([
          ...questions.filter((q) => q.no !== no),
          { ...seed, part: 1 },
          { ...seed, part: 2, answer: "" },
        ])
      );
      return;
    }
    const nextPart = Math.max(...parts.map((q) => q.part)) + 1;
    if (nextPart > MAX_PARTS_PER_QUESTION) return;
    const seed = parts[0];
    setQuestions(
      distributePoints([...questions, { ...seed, part: nextPart, answer: "" }])
    );
  };

  /** 부분문제 삭제. 하나만 남으면 다시 일반 문항으로 되돌린다. */
  const removePart = (no: number, part: number) => {
    const rest = questions.filter((q) => !(q.no === no && q.part === part));
    const parts = rest.filter((q) => q.no === no && q.part);
    if (parts.length === 1) {
      setQuestions(
        distributePoints(
          rest.map((q) =>
            q.no === no && q.part === parts[0].part ? { ...q, part: 0 } : q
          )
        )
      );
      return;
    }
    setQuestions(distributePoints(rest));
  };

  const redistribute = () => setQuestions(distributePoints(questions));
  const setAllChoices = (choices: number) =>
    setQuestions(questions.map((q) => ({ ...q, choices })));

  // 마지막으로 누른 답 입력칸 (기호 팔레트가 여기에 넣는다)
  const activeAnswer = useRef<ActiveAnswer | null>(null);
  const [activeLabel, setActiveLabel] = useState("");

  const insertSymbol = (symbol: string) => {
    const active = activeAnswer.current;
    if (!active) return;
    const { el, no, part } = active;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + symbol + el.value.slice(end);
    patch(no, part, { answer: next });
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + symbol.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const rows = sortQuestions(questions);

  /**
   * 난이도는 시험지에서 늘 오름차순이라, 한 문항을 고르면 그 아래 문항까지 같이 맞춘다.
   * (1번을 "하"로 하면 전부 "하", 이어서 6번을 "중"으로 하면 6번부터 끝까지 "중")
   */
  const setDifficultyFrom = (index: number, difficulty: Difficulty) => {
    const targets = new Set(
      rows.slice(index).map((q) => `${q.no}-${q.part}`)
    );
    setQuestions(
      questions.map((q) =>
        targets.has(`${q.no}-${q.part}`) ? { ...q, difficulty } : q
      )
    );
  };

  /** 한 시험지는 유형이 같은 경우가 많아, 첫 문항 유형으로 전부 맞춘다. */
  const unifyTypes = () => {
    const first = rows[0]?.type ?? "";
    if (!first.trim()) {
      alert("먼저 1번 문항의 유형(출제 단원)을 적어 주세요.");
      return;
    }
    setQuestions(questions.map((q) => ({ ...q, type: first })));
  };

  // 답안 키 표 안에서 방향키로 칸을 옮긴다 (0 정답 · 1 배점 · 2 유형 · 3 난이도)
  const keyGridRef = useRef<HTMLTableSectionElement>(null);
  const KEY_LAST_COL = 3;
  const focusKeyCell = (row: number, col: number) => {
    const el = keyGridRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[data-krow="${row}"][data-kcol="${col}"]`
    );
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
  };
  const onKeyNav = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    row: number,
    col: number
  ) => {
    const el = e.currentTarget;
    const isText = el instanceof HTMLInputElement;
    const atEnd = !isText || (el.selectionStart ?? 0) === el.value.length;
    const atStart = !isText || (el.selectionStart ?? 0) === 0;
    const lastRow = rows.length - 1;
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      focusKeyCell(Math.min(lastRow, row + 1), col);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusKeyCell(Math.max(0, row - 1), col);
    } else if (e.key === "ArrowRight" && atEnd) {
      e.preventDefault();
      if (col < KEY_LAST_COL) focusKeyCell(row, col + 1);
      else if (row < lastRow) focusKeyCell(row + 1, 0);
    } else if (e.key === "ArrowLeft" && atStart) {
      e.preventDefault();
      if (col > 0) focusKeyCell(row, col - 1);
      else if (row > 0) focusKeyCell(row - 1, KEY_LAST_COL);
    }
  };
  // 배점 합이 100.03 처럼 딱 떨어지지 않아도 만점은 항상 100점 (점수는 비율로 계산)
  const hasPoints = totalPoints(questions) > 0;
  const hasParts = (no: number) => questions.some((q) => q.no === no && q.part);
  const partsPoints = (no: number) =>
    Math.round(
      questions
        .filter((q) => q.no === no && q.part)
        .reduce((a, q) => a + (q.points || 0), 0) * 100
    ) / 100;

  return (
    <Card style={{ padding: 16, marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <KeyRound size={17} color={T.primary} />
        <span style={{ fontSize: 15.5, fontWeight: 800, color: T.ink }}>
          그날의 테스트 답안 (정답)
        </span>
        <Pill tone={hasPoints ? "primary" : "warn"}>
          {hasPoints ? `만점 ${FULL_SCORE}점` : "배점을 입력해주세요"}
        </Pill>
        {dirty && <Pill tone="warn">저장 안 됨</Pill>}
        <div style={{ flex: 1 }} />
        <Btn variant="outline" size="sm" onClick={onOpenTypeOrder} title="유형(단원) 순서 설정">
          <ListOrdered size={14} />
          단원 순서
        </Btn>
        <Btn
          variant="outline"
          size="sm"
          onClick={() => setPastExam(!pastExam)}
          title="이 테스트가 특정 학교 기출이면 켜세요. 유형별 강약점 집계에서 빠지고, 오답 노트에서는 유형 그대로 분류됩니다."
          style={pastExam ? { borderColor: T.accent, color: T.accent } : undefined}
        >
          <School size={14} />
          {pastExam ? "기출 회차" : "기출 아님"}
        </Btn>
        {pastExam && (
          <input
            style={{ ...inputBase, width: 190, height: 32, fontSize: 13 }}
            value={pastExamSchool}
            placeholder="어느 학교 기출인가요"
            title="학생 화면에 '둔산여고 기출' 처럼 표시됩니다."
            maxLength={60}
            onChange={(e) => setPastExamSchool(e.target.value)}
          />
        )}
        <Btn
          variant="outline"
          size="sm"
          onClick={() => setPublished(!published)}
          title="학생·학부모 화면에 이 회차 분석을 공개할지"
        >
          {published ? <Eye size={14} /> : <EyeOff size={14} />}
          {published ? "공개 중" : "비공개"}
        </Btn>
        <Btn size="sm" onClick={onSave} disabled={saving}>
          <Save size={14} />
          {saving ? "저장 중…" : "답안 저장 · 재채점"}
        </Btn>
      </div>

      <div
        style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          alignItems: "flex-end",
          marginBottom: 12,
        }}
      >
        <div style={{ width: 110 }}>
          <div style={lbl}>문항 수</div>
          <input
            style={{ ...inputBase, textAlign: "center" }}
            inputMode="numeric"
            title="1~N번으로 만듭니다. 특정 번호만 쓰려면 아래 표에서 문항을 지우세요."
            value={countDraft}
            onChange={(e) => setCountDraft(e.target.value)}
            onBlur={() => applyCount(countDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </div>
        <div style={{ flex: "0 0 auto" }}>
          <div style={lbl}>문항 추가</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              style={{ ...inputBase, width: 64, textAlign: "center", padding: "8px 6px" }}
              inputMode="numeric"
              placeholder="번호"
              title="넣을 문번 (비워 두면 마지막 번호 다음)"
              value={addDraft}
              onChange={(e) => setAddDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addQuestion();
              }}
            />
            <Btn variant="outline" size="sm" onClick={() => addQuestion()}>
              <Plus size={14} />
              추가
            </Btn>
          </div>
        </div>
        <div style={{ flex: "0 0 auto" }}>
          <div style={lbl}>배점 · 문제 형태 일괄</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
            <Btn variant="outline" size="sm" onClick={redistribute}>
              100점 균등 배분
            </Btn>
            <Btn
              variant="outline"
              size="sm"
              onClick={() => setAllChoices(DEFAULT_CHOICES)}
            >
              전체 객관식
            </Btn>
            <Btn variant="outline" size="sm" onClick={() => setAllChoices(0)}>
              전체 단답형
            </Btn>
            <Btn
              variant="outline"
              size="sm"
              onClick={unifyTypes}
              title="모든 문항의 유형(출제 단원)을 1번 문항과 같게 맞춥니다"
            >
              1번 문항과 유형 통일
            </Btn>
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: T.sub, lineHeight: 1.6, flex: 1, minWidth: 240 }}>
          배점은 <b>모든 문항이 같게</b> 자동 배분되고, 점수는 항상 <b>100점 만점</b>으로
          계산됩니다 (9문항이면 각 11.11점이어도 다 맞으면 100점). 부분문제가 있으면 그 문항
          몫을 다시 나눠 가집니다.
          <br />
          정답은 <b>문자·문자열</b>도 됩니다. 복수 정답은 <b>|</b> 로 구분하세요 (예: <b>3|③</b>).
          <br />
          그날 푼 문항만 채점하려면 표에서 <b>N번 삭제</b>로 빼면 됩니다 (예: 4·7·10번만 남기기).
          <br />
          학교 기출을 그대로 푼 날은 위 <b>기출 회차</b>를 켜고 <b>학교 이름</b>을 적으세요
          (예: 둔산여고, 대전고 2024 1학기 중간). 학생 화면에 <b>둔산여고 기출</b>로 표시되고,
          유형별 강약점 집계에서는 빠집니다. 오답 노트에서는 유형 칸에 적은 이름으로 묶입니다.
          <br />
          표 안에서는 <b>↑ ↓ ← →</b> 로 칸을 옮길 수 있고, <b>난이도</b>를 고르면 그 아래 문항까지
          같은 난이도로 맞춰집니다 (난이도는 오름차순).
        </div>
      </div>

      {/* 수식 기호 입력 도우미 */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "10px 12px",
          background: "#F6F8FB",
          borderRadius: 10,
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 800, color: T.sub, whiteSpace: "nowrap" }}>
          수식 기호
          {activeLabel && (
            <span style={{ color: T.primary }}> · {activeLabel}번에 입력</span>
          )}
        </span>
        <MathPalette onInsert={insertSymbol} disabled={!activeLabel} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: T.muted, whiteSpace: "nowrap" }}>
          키보드로 입력: {"<= ≤ · >= ≥ · != ≠ · +- ± · ^2 ² · sqrt √ · inf ∞ · pi π"}
        </span>
      </div>

      {isSparse && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            fontSize: 12.5,
            fontWeight: 700,
            color: T.primary,
            background: T.primarySoft,
            borderRadius: 9,
            padding: "8px 11px",
            marginBottom: 10,
          }}
        >
          <span>
            이 회차 문번: {mainNos.join(", ")}번 ({mainNos.length}문항)
          </span>
          {missingNos.length > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                flexWrap: "wrap",
                color: T.sub,
                fontWeight: 600,
              }}
            >
              빠진 번호
              {missingNos.map((n) => (
                <button
                  key={n}
                  onClick={() => addQuestion(String(n))}
                  title={`${n}번 문항 다시 넣기`}
                  style={{
                    padding: "2px 9px",
                    borderRadius: 999,
                    border: `1px solid ${T.line}`,
                    background: "#fff",
                    color: T.primary,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  +{n}
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr>
              {[
                "문번",
                "정답",
                "배점",
                "유형 (출제 단원)",
                "난이도",
                "문제 형태",
                "",
              ].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody ref={keyGridRef}>
            {rows.map((q, rowIndex) => {
              const label = questionLabel(q);
              const isFirstOfNo =
                rows.findIndex((x) => x.no === q.no) === rows.indexOf(q);
              return (
                <tr key={label} style={{ borderBottom: `1px solid ${T.line}` }}>
                  <td
                    style={{
                      padding: "6px 10px",
                      fontWeight: 800,
                      color: q.part ? T.sub : T.ink,
                      fontSize: 13.5,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </td>
                  <td style={{ padding: "6px 8px", minWidth: 190 }}>
                    <AnswerInput
                      style={{ ...cellBase, fontWeight: 700, textAlign: "left" }}
                      value={q.answer}
                      placeholder="정답"
                      dataRow={rowIndex}
                      dataCol={0}
                      onKeyDown={(e) => onKeyNav(e, rowIndex, 0)}
                      onFocus={(el) => {
                        activeAnswer.current = { el, no: q.no, part: q.part };
                        setActiveLabel(label);
                      }}
                      onChange={(v) => patch(q.no, q.part, { answer: v })}
                    />
                  </td>
                  <td style={{ padding: "6px 8px", width: 80 }}>
                    {hasParts(q.no) && !q.part ? (
                      <div
                        style={{ ...cellBase, background: "#F6F8FB", color: T.muted }}
                        title="부분문제 배점의 합으로 계산됩니다."
                      >
                        {partsPoints(q.no)}
                      </div>
                    ) : (
                      <input
                        style={cellBase}
                        inputMode="decimal"
                        data-krow={rowIndex}
                        data-kcol={1}
                        onKeyDown={(e) => onKeyNav(e, rowIndex, 1)}
                        value={String(q.points)}
                        onChange={(e) =>
                          patch(q.no, q.part, { points: Number(e.target.value) || 0 })
                        }
                      />
                    )}
                  </td>
                  <td style={{ padding: "6px 8px", minWidth: 150 }}>
                    <input
                      style={{ ...cellBase, textAlign: "left" }}
                      value={q.type}
                      placeholder="예: 삼각함수 그래프"
                      data-krow={rowIndex}
                      data-kcol={2}
                      onKeyDown={(e) => onKeyNav(e, rowIndex, 2)}
                      onChange={(e) => patch(q.no, q.part, { type: e.target.value })}
                    />
                  </td>
                  <td style={{ padding: "6px 8px", width: 90 }}>
                    <select
                      style={{ ...cellBase, padding: "6px" }}
                      value={q.difficulty}
                      data-krow={rowIndex}
                      data-kcol={3}
                      title="이 문항부터 아래 문항까지 같은 난이도로 맞춰집니다"
                      onKeyDown={(e) => onKeyNav(e, rowIndex, 3)}
                      onChange={(e) =>
                        setDifficultyFrom(rowIndex, e.target.value as Difficulty)
                      }
                    >
                      <option value="">-</option>
                      {DIFFICULTIES.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: "6px 8px", width: 190 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <ChoiceToggle
                        multiple={isMultipleChoice(q)}
                        onChange={(multiple) =>
                          patch(q.no, q.part, {
                            choices: multiple ? DEFAULT_CHOICES : 0,
                          })
                        }
                      />
                      {isMultipleChoice(q) && (
                        <input
                          style={{ ...cellBase, width: 54 }}
                          inputMode="numeric"
                          title="보기 수"
                          value={String(q.choices)}
                          onChange={(e) =>
                            patch(q.no, q.part, {
                              choices: Math.max(
                                1,
                                Math.min(9, Number(e.target.value) || 1)
                              ),
                            })
                          }
                        />
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                    {isFirstOfNo && (
                      <>
                        <Btn variant="ghost" size="xs" onClick={() => addPart(q.no)}>
                          <Plus size={13} />
                          부분문제
                        </Btn>
                        <Btn
                          variant="ghost"
                          size="xs"
                          disabled={mainNos.length <= 1}
                          onClick={() => removeQuestion(q.no)}
                          title={`${q.no}번 문항 삭제 (안 푼 문항일 때)`}
                        >
                          <Trash2 size={13} />
                          {q.no}번 삭제
                        </Btn>
                      </>
                    )}
                    {!!q.part && (
                      <Btn
                        variant="ghost"
                        size="xs"
                        onClick={() => removePart(q.no, q.part)}
                        title="이 부분문제 삭제"
                      >
                        <Trash2 size={13} />
                      </Btn>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ============================== 파일 (시험지·답지) ============================== */
const isPdf = (f: { filename?: string; contentType?: string; name?: string }) =>
  (f.contentType ?? "").includes("pdf") ||
  /\.pdf$/i.test(f.filename ?? f.name ?? "");

/** 파일 종류 → 문항 위치의 종류 (답지는 해설지로 취급). */
const regionKindOf = (kind: FileKind): "paper" | "solution" =>
  kind === "answer" ? "solution" : "paper";

function TestFiles({
  termId,
  subject,
  date,
  files,
  regions,
  questionNos,
  onChanged,
}: {
  termId: string;
  subject: string;
  date: string;
  files: FileMeta[];
  regions: QuestionRegion[];
  questionNos: number[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<FileKind | null>(null);
  const [marking, setMarking] = useState<FileMeta | null>(null);
  const [note, setNote] = useState("");

  const openMarker = (meta: FileMeta) => {
    if (!questionNos.length) {
      setNote("답안(정답)을 먼저 저장하면 문항 위치를 잡을 수 있습니다.");
      return;
    }
    setMarking(meta);
  };

  const upload = async (kind: FileKind, file: File) => {
    setBusy(kind);
    // 무료 DB 용량을 아끼기 위해 큰 파일은 미리 알려 준다.
    setNote(
      file.size > 3 * 1024 * 1024
        ? `파일이 ${formatFileSize(file.size)} 입니다. 저장 공간을 아끼려면 PDF를 조금 낮은 해상도로 내보내 올리는 것을 권합니다.`
        : ""
    );
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("term", termId);
      fd.append("subject", subject);
      fd.append("date", date);
      fd.append("kind", kind);
      const res = await fetch("/api/admin/files", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "업로드에 실패했습니다.");
      onChanged();
      // PDF면 업로드 직후 문항 위치를 잡는 화면을 띄운다.
      if (kind !== "etc" && isPdf(file) && questionNos.length) {
        setMarking(data as FileMeta);
      }
    } catch (e: any) {
      alert(e.message || "업로드에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const regionCount = (fileId: string) =>
    new Set(regions.filter((r) => r.fileId === fileId).map((r) => r.no)).size;

  const remove = async (id: string) => {
    if (!confirm("이 파일을 삭제할까요?")) return;
    try {
      await api.del(`/api/admin/files?id=${id}`);
      onChanged();
    } catch (e: any) {
      alert(e.message || "삭제에 실패했습니다.");
    }
  };

  return (
    <Card style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Upload size={17} color={T.primary} />
        <span style={{ fontSize: 15.5, fontWeight: 800, color: T.ink }}>
          시험지 · 답지 업로드
        </span>
        <span style={{ fontSize: 12.5, color: T.muted }}>
          PDF·이미지·HWP · 20MB 이하 · 학생/학부모가 다운로드합니다
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: T.muted, whiteSpace: "nowrap" }}>
          이 회차 자료 {formatFileSize(files.reduce((a, f) => a + f.size, 0))}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: T.sub, marginBottom: 10, lineHeight: 1.6 }}>
        PDF로 올리면 <b>문항 위치</b>를 자동으로 잡아 드립니다(확인 화면에서 수정 가능).
        그러면 학생 오답 노트에서 틀린 문항의 <b>문제</b>와 <b>답·해설</b>만 잘라서 볼 수
        있어요. 원본 PDF만 저장하고 위치는 좌표로만 기록해 용량을 거의 쓰지 않습니다.
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        {(["paper", "answer", "etc"] as FileKind[]).map((kind) => (
          <label key={kind} style={{ display: "inline-flex" }}>
            <input
              type="file"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) upload(kind, f);
              }}
            />
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 10,
                border: `1px solid ${T.line}`,
                background: "#fff",
                color: T.ink,
                fontSize: 13.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Upload size={14} />
              {busy === kind ? "업로드 중…" : `${FILE_KIND_LABEL[kind]} 올리기`}
            </span>
          </label>
        ))}
      </div>

      {note && (
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: T.primary,
            background: T.primarySoft,
            borderRadius: 9,
            padding: "8px 11px",
            marginBottom: 10,
          }}
        >
          {note}
        </div>
      )}

      <RegionMarker
        open={!!marking}
        file={marking}
        termId={termId}
        subject={subject}
        date={date}
        questionNos={questionNos}
        onClose={() => setMarking(null)}
        onSaved={(n) => {
          setNote(`문항 ${n}개 위치를 저장했습니다.`);
          onChanged();
        }}
      />

      {files.length === 0 ? (
        <div style={{ fontSize: 13, color: T.muted }}>업로드된 파일이 없습니다.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {files.map((f) => (
            <div
              key={f.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                border: `1px solid ${T.line}`,
                borderRadius: 10,
                fontSize: 13.5,
              }}
            >
              <Pill tone={f.kind === "answer" ? "ok" : "primary"}>
                {FILE_KIND_LABEL[f.kind]}
              </Pill>
              <a
                href={`/api/files/${f.id}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: T.ink, fontWeight: 600, textDecoration: "none", flex: 1 }}
              >
                {f.filename}
              </a>
              <span style={{ color: T.muted, fontSize: 12.5 }}>
                {formatFileSize(f.size)}
              </span>
              {f.kind !== "etc" && isPdf(f) && (
                <>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: regionCount(f.id) ? T.ok : T.muted,
                      whiteSpace: "nowrap",
                    }}
                    title="문항별 위치를 잡아두면 학생 오답 노트에서 그 문항만 잘라 볼 수 있습니다."
                  >
                    {regionCount(f.id) ? `문항 ${regionCount(f.id)}개` : "위치 없음"}
                  </span>
                  <Btn
                    variant="ghost"
                    size="xs"
                    onClick={() => openMarker(f)}
                    title="문항 위치 잡기"
                  >
                    <ScanLine size={13} />
                  </Btn>
                </>
              )}
              <Btn variant="ghost" size="xs" onClick={() => remove(f.id)}>
                <Trash2 size={13} />
              </Btn>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ============================== 학생 답안 입력 ============================== */
/** 답이 길면 잘려 보이지 않도록 문항별 칸 너비를 답 길이에 맞춘다. */
const CELL_MIN = 48;
const CELL_MAX = 200;
function cellWidthOf(texts: (string | undefined)[]): number {
  const longest = Math.max(0, ...texts.map((t) => (t ?? "").length));
  return Math.round(Math.min(CELL_MAX, Math.max(CELL_MIN, longest * 9 + 22)));
}

function AnswerGrid({
  questions,
  roster,
  answers,
  excluded,
  setAnswer,
  toggleExcluded,
  autoAdvance,
}: {
  questions: TestQuestion[];
  roster: RosterRow[];
  answers: Record<string, AnswerMap>;
  excluded: Record<string, string[]>;
  setAnswer: (studentId: string, label: string, value: string) => void;
  toggleExcluded: (studentId: string, label: string) => void;
  autoAdvance: boolean;
}) {
  const gridRef = useRef<HTMLTableSectionElement>(null);

  // 문항별 칸 너비 (정답 + 학생들이 쓴 답 중 가장 긴 것 기준)
  const widths = useMemo(() => {
    const map: Record<string, number> = {};
    for (const q of questions) {
      const label = questionLabel(q);
      map[label] = cellWidthOf([
        q.answer,
        ...roster.map((stu) => answers[stu.studentId]?.[label]),
      ]);
    }
    return map;
  }, [questions, roster, answers]);

  const focusCell = (row: number, col: number) => {
    const el = gridRef.current?.querySelector<HTMLInputElement>(
      `input[data-row="${row}"][data-col="${col}"]`
    );
    if (el) {
      el.focus();
      el.select();
    }
  };

  /** 그 학생이 안 푸는 문항으로 막아 둔 칸인지 */
  const isOff = (row: number, col: number) =>
    !!roster[row] &&
    !!questions[col] &&
    (excluded[roster[row].studentId] ?? []).includes(questionLabel(questions[col]));

  /**
   * 막아 둔 칸은 건너뛰며 한 방향으로 이동한다.
   * 그 방향에 들어갈 수 있는 칸이 없으면 제자리에 남는다.
   */
  const moveFocus = (row: number, col: number, dRow: number, dCol: number) => {
    let r = row + dRow;
    let c = col + dCol;
    while (r >= 0 && r < roster.length && c >= 0 && c < questions.length) {
      if (!isOff(r, c)) {
        focusCell(r, c);
        return true;
      }
      r += dRow;
      c += dCol;
    }
    return false;
  };

  /** 그 문항에서 답을 넣을 수 있는 첫 학생으로 (Enter 로 다음 문항에 넘어갈 때) */
  const focusColumnTop = (col: number) => {
    for (let r = 0; r < roster.length; r++) {
      if (!isOff(r, col)) {
        focusCell(r, col);
        return true;
      }
    }
    return false;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    const last = questions.length - 1;
    const mod = e.ctrlKey || e.metaKey;

    // Ctrl/⌘ + Enter : 이 칸에 정답을 그대로 채운다 (복수 정답이면 첫 번째)
    if (mod && e.key === "Enter") {
      e.preventDefault();
      const q = questions[col];
      // 안 푸는 문항으로 표시한 칸에는 답을 넣지 않는다
      if (isOff(row, col)) return;
      const key = (q?.answer ?? "").split(ANSWER_ALT_SEPARATOR)[0].trim();
      if (key) {
        setAnswer(roster[row].studentId, questionLabel(q), key);
        requestAnimationFrame(() => moveFocus(row, col, 0, 1));
      }
      return;
    }
    // Ctrl/⌘ + \ : 이 학생이 안 푸는 문항으로 표시 / 해제 (미제출과 다르다)
    if (mod && (e.key === "\\" || e.code === "Backslash" || e.key === "₩")) {
      e.preventDefault();
      toggleExcluded(roster[row].studentId, questionLabel(questions[col]));
      // 표시하고 나면 바로 다음 문항으로 넘어간다 (연달아 표시하기 쉽게)
      requestAnimationFrame(() => moveFocus(row, col, 0, 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      // Enter = 다음 학생 (같은 문항). 마지막 학생이면 다음 문항 첫 학생.
      if (!moveFocus(row, col, 1, 0) && col < last) focusColumnTop(col + 1);
      return;
    }
    // 방향키는 막아 둔 칸을 건너뛴다.
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(row, col, 1, 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(row, col, -1, 0);
    } else if (e.key === "ArrowRight" && (e.target as HTMLInputElement).selectionStart ===
      (e.target as HTMLInputElement).value.length) {
      e.preventDefault();
      moveFocus(row, col, 0, 1);
    } else if (e.key === "ArrowLeft" && (e.target as HTMLInputElement).selectionStart === 0) {
      e.preventDefault();
      moveFocus(row, col, 0, -1);
    }
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 13.5 }}>
        <thead>
          <tr>
            <th style={{ ...th, position: "sticky", left: 0, zIndex: 2, textAlign: "left" }}>
              이름
            </th>
            {questions.map((q) => {
              const label = questionLabel(q);
              return (
                <th
                  key={label}
                  style={{ ...th, minWidth: widths[label] + 6, maxWidth: CELL_MAX + 20 }}
                >
                  {label}
                  <div
                    title={q.answer}
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: T.muted,
                      whiteSpace: "normal",
                      wordBreak: "break-word",
                      lineHeight: 1.35,
                    }}
                  >
                    {q.answer || "-"}
                  </div>
                </th>
              );
            })}
            <th style={{ ...th, minWidth: 82 }}>점수</th>
          </tr>
        </thead>
        <tbody ref={gridRef}>
          {roster.map((stu, row) => {
            const mine = answers[stu.studentId] ?? {};
            const skip = excluded[stu.studentId] ?? [];
            const graded = gradeAnswers(questions, mine, skip);
            const answered = Object.values(mine).some((v) => v.trim() !== "");
            return (
              <tr key={stu.studentId} style={{ borderBottom: `1px solid ${T.line}` }}>
                <td
                  style={{
                    padding: "4px 10px",
                    fontWeight: 700,
                    color: T.ink,
                    whiteSpace: "nowrap",
                    position: "sticky",
                    left: 0,
                    background: "#fff",
                    borderRight: `1px solid ${T.line}`,
                    zIndex: 1,
                  }}
                >
                  {stu.name}
                  {stu.attendance === "결석" && (
                    <span style={{ color: T.bad, fontSize: 11.5, marginLeft: 6 }}>결석</span>
                  )}
                  {stu.status === "퇴원" && (
                    <span style={{ color: T.muted, fontSize: 11.5, marginLeft: 6 }}>퇴원</span>
                  )}
                </td>
                {questions.map((q, col) => {
                  const label = questionLabel(q);
                  const off = skip.includes(label);
                  const value = mine[label] ?? "";
                  const filled = !off && value.trim() !== "";
                  const correct = graded.results.find((r) => r.label === label)?.correct;
                  return (
                    <td key={label} style={{ padding: 3 }}>
                      <input
                        data-row={row}
                        data-col={col}
                        value={off ? "/" : value}
                        readOnly={off}
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => onKeyDown(e, row, col)}
                        onChange={(e) => {
                          const pos = e.target.selectionStart ?? e.target.value.length;
                          const converted = applyMathShortcuts(e.target.value, pos);
                          const v = converted.value;
                          if (v !== e.target.value) {
                            e.target.value = v;
                            e.target.setSelectionRange(converted.caret, converted.caret);
                          }
                          setAnswer(stu.studentId, label, v);
                          // 객관식 한 자리 답은 입력 즉시 다음 문항으로 이동
                          if (
                            autoAdvance &&
                            q.choices > 0 &&
                            v.length === 1 &&
                            /[1-9]/.test(v) &&
                            col < questions.length - 1
                          ) {
                            requestAnimationFrame(() => moveFocus(row, col, 0, 1));
                          }
                        }}
                        title={
                          off
                            ? "이 학생은 안 푸는 문항 (Ctrl+\\ 로 해제) · 만점에서 빠집니다"
                            : value
                        }
                        style={{
                          ...cellBase,
                          width: widths[label] ?? CELL_MIN,
                          fontWeight: 700,
                          background: off
                            ? "#EEF1F6"
                            : !filled
                            ? "#fff"
                            : correct
                            ? T.okSoft
                            : T.badSoft,
                          color: off ? T.muted : !filled ? T.ink : correct ? T.ok : T.bad,
                          borderColor: off
                            ? T.line
                            : filled
                            ? correct
                              ? T.ok
                              : T.bad
                            : T.line,
                          borderStyle: off ? "dashed" : "solid",
                          cursor: off ? "not-allowed" : "text",
                        }}
                      />
                    </td>
                  );
                })}
                <td
                  style={{
                    padding: "4px 10px",
                    textAlign: "center",
                    fontWeight: 800,
                    color: answered ? T.primary : T.muted,
                    whiteSpace: "nowrap",
                  }}
                >
                  {answered ? (
                    <>
                      {graded.score}
                      <span style={{ color: T.muted, fontWeight: 500 }}>
                        {" "}
                        / {graded.max}
                      </span>
                      {!!skip.length && (
                        <div style={{ fontSize: 10.5, fontWeight: 600, color: T.muted }}>
                          {questions.length - skip.length}문항 기준
                        </div>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ============================== 메인 ============================== */
export function AdminScores({
  termId,
  students,
  subjects,
  closedSubjects,
  clinicDates,
  clinicDatesBySubject,
  initialSubject,
  initialDate,
  onSelection,
}: {
  termId: string;
  students: Student[];
  subjects: string[];
  closedSubjects?: string[];
  clinicDates: string[];
  clinicDatesBySubject?: Record<string, string[]>;
  initialSubject: string;
  initialDate: string;
  onSelection?: (subject: string, date: string) => void;
}) {
  const [showClosed, setShowClosed] = useState(false);
  const closedList = useMemo(
    () => normalizeClosedSubjects(closedSubjects, subjects),
    [closedSubjects, subjects]
  );
  const pickable = useMemo(
    () => visibleSubjects({ subjects, closedSubjects }, showClosed),
    [subjects, closedSubjects, showClosed]
  );
  const [subject, setSubject] = useState(
    () => (pickable.includes(initialSubject) ? initialSubject : pickable[0]) ?? ""
  );
  useEffect(() => {
    setSubject((cur) => (pickable.includes(cur) ? cur : pickable[0] ?? ""));
  }, [pickable]);

  const subjectDates = useMemo(
    () => getClinicDatesForSubject({ clinicDates, clinicDatesBySubject }, subject),
    [clinicDates, clinicDatesBySubject, subject]
  );
  // 다른 탭에서 보던 날짜를 이어받되, 아직 수업하지 않은 날이면 채점할 지난 회차로.
  const startDate = (dates: string[]) =>
    dates.includes(initialDate) && initialDate <= todayIso()
      ? initialDate
      : pickGradingDate(dates);
  const [date, setDate] = useState(() => startDate(subjectDates));
  useEffect(() => {
    setDate((cur) => (subjectDates.includes(cur) ? cur : pickGradingDate(subjectDates)));
  }, [subjectDates]);
  useEffect(() => {
    if (subject && date) onSelection?.(subject, date);
  }, [subject, date, onSelection]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [paper, setPaper] = useState<PaperData | null>(null);
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [published, setPublished] = useState(true);
  const [pastExam, setPastExam] = useState(false);
  const [pastExamSchool, setPastExamSchool] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerMap>>({});
  // 학생별 "안 푸는 문항" (미제출과 다르다 → 만점에서 빠진다)
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [showQuit, setShowQuit] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [savedAt, setSavedAt] = useState(0);
  const [typeOrderOpen, setTypeOrderOpen] = useState(false);

  // silent=true 면 화면을 "불러오는 중"으로 바꾸지 않고 조용히 갱신한다.
  // (파일 업로드 후 새로고침할 때 열려 있는 모달이 닫히지 않도록)
  const load = useCallback(
    async (silent = false) => {
      if (!termId || !subject || !date) {
        setPaper(null);
        setRoster([]);
        setFiles([]);
        return;
      }
      if (!silent) setLoading(true);
      setErr("");
      try {
        const d = await api.get(
          `/api/admin/testpaper?term=${termId}&subject=${encodeURIComponent(
            subject
          )}&date=${date}`
        );
        setPaper(d.paper);
        setFiles(d.files ?? []);
        setRoster(d.roster ?? []);
        const map: Record<string, AnswerMap> = {};
        const skips: Record<string, string[]> = {};
        for (const r of d.roster ?? []) {
          map[r.studentId] = { ...r.answers };
          skips[r.studentId] = [...(r.excluded ?? [])];
        }
        setAnswers(map);
        setExcluded(skips);
        if (!silent) {
          setQuestions(
            d.paper.questions.length
              ? d.paper.questions
              : buildQuestions(DEFAULT_QUESTION_COUNT)
          );
          setPublished(d.paper.answersPublished !== false);
          setPastExam(!!d.paper.pastExam);
          setPastExamSchool(d.paper.pastExamSchool ?? "");
          setDirty(false);
        }
      } catch (e: any) {
        setErr(e.message || "불러오지 못했습니다.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [termId, subject, date]
  );

  useEffect(() => {
    load();
  }, [load]);

  const saveKey = async () => {
    setSaving(true);
    try {
      const d = await api.put("/api/admin/testpaper", {
        term: termId,
        subject,
        date,
        questions,
        answersPublished: published,
        pastExam,
        pastExamSchool,
      });
      setPaper(d.paper);
      setQuestions(d.paper.questions);
      setDirty(false);
      setSavedAt(Date.now());
      await load();
    } catch (e: any) {
      alert(e.message || "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  // 학생 답안: 입력하면 그 학생 행만 디바운스 저장
  const pending = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const excludedRef = useRef(excluded);
  excludedRef.current = excluded;

  const flushStudent = useCallback(
    async (studentId: string) => {
      try {
        const res = await api.put("/api/admin/answers", {
          term: termId,
          subject,
          date,
          studentId,
          answers: answersRef.current[studentId] ?? {},
          excluded: excludedRef.current[studentId] ?? [],
        });
        setRoster((prev) =>
          prev.map((r) =>
            r.studentId === studentId
              ? { ...r, score: res.score, pct: res.pct, auto: true }
              : r
          )
        );
        setSavedAt(Date.now());
      } catch (e: any) {
        alert(e.message || "답안 저장에 실패했습니다.");
      }
    },
    [termId, subject, date]
  );

  /** 그 학생 행만 잠시 뒤에 저장한다 (연달아 입력해도 한 번만 저장). */
  const queueSave = useCallback(
    (studentId: string) => {
      const timers = pending.current;
      const prevTimer = timers.get(studentId);
      if (prevTimer) clearTimeout(prevTimer);
      timers.set(
        studentId,
        setTimeout(() => {
          timers.delete(studentId);
          flushStudent(studentId);
        }, 700)
      );
    },
    [flushStudent]
  );

  const setAnswer = useCallback(
    (studentId: string, label: string, value: string) => {
      setAnswers((prev) => ({
        ...prev,
        [studentId]: { ...(prev[studentId] ?? {}), [label]: value },
      }));
      queueSave(studentId);
    },
    [queueSave]
  );

  /** 이 학생이 안 푸는 문항으로 표시 / 해제. 표시하면 그 칸의 답안은 지운다. */
  const toggleExcluded = useCallback(
    (studentId: string, label: string) => {
      setExcluded((prev) => {
        const cur = prev[studentId] ?? [];
        const next = cur.includes(label)
          ? cur.filter((l) => l !== label)
          : [...cur, label];
        return { ...prev, [studentId]: next };
      });
      setAnswers((prev) => {
        const mine = prev[studentId] ?? {};
        if (!mine[label]) return prev;
        const next = { ...mine };
        delete next[label];
        return { ...prev, [studentId]: next };
      });
      queueSave(studentId);
    },
    [queueSave]
  );

  useEffect(
    () => () => {
      pending.current.forEach((t) => clearTimeout(t));
    },
    []
  );

  const visibleRoster = useMemo(
    () => roster.filter((r) => showQuit || r.status !== "퇴원"),
    [roster, showQuit]
  );

  // 주 문항 번호 (부분문제는 한 문항으로 묶는다)
  const mainQuestionNos = useMemo(
    () => [...new Set((paper?.questions ?? []).map((q) => q.no))].sort((a, b) => a - b),
    [paper?.questions]
  );

  const gradable = useMemo(() => {
    const hasParts = new Set(questions.filter((q) => q.part).map((q) => q.no));
    return sortQuestions(questions).filter((q) => q.part || !hasParts.has(q.no));
  }, [questions]);

  // 반 요약 (지금 화면 값 기준)
  const summary = useMemo(() => {
    const pcts: number[] = [];
    for (const r of visibleRoster) {
      const mine = answers[r.studentId] ?? {};
      if (!Object.values(mine).some((v) => v.trim() !== "")) continue;
      pcts.push(gradeAnswers(questions, mine, excluded[r.studentId] ?? []).pct);
    }
    if (!pcts.length) return null;
    return {
      n: pcts.length,
      avg: Math.round(pcts.reduce((a, p) => a + p, 0) / pcts.length),
      best: Math.max(...pcts),
    };
  }, [visibleRoster, answers, excluded, questions]);

  const hasKey = (paper?.questions.length ?? 0) > 0;

  return (
    <div>
      <SectionTitle>성적 입력</SectionTitle>

      <Card style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: 170 }}>
            <div style={lbl}>반 (수업)</div>
            <select
              style={inputBase}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              {pickable.length ? (
                pickable.map((s) => (
                  <option key={s} value={s}>
                    {closedList.includes(s) ? `${s} (종료)` : s}
                  </option>
                ))
              ) : (
                <option value="">진행 중인 수업 없음</option>
              )}
            </select>
          </div>
          <div style={{ minWidth: 140 }}>
            <div style={lbl}>클리닉 날짜</div>
            <select
              style={inputBase}
              value={date}
              disabled={!subjectDates.length}
              onChange={(e) => setDate(e.target.value)}
            >
              {subjectDates.length ? (
                subjectDates.map((d) => (
                  <option key={d} value={d}>
                    {md(d)}
                  </option>
                ))
              ) : (
                <option value="">등록된 날짜 없음</option>
              )}
            </select>
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13.5,
              color: T.sub,
              marginBottom: 10,
              cursor: "pointer",
            }}
          >
            <input type="checkbox" checked={showQuit} onChange={(e) => setShowQuit(e.target.checked)} />
            퇴원생
          </label>
          {closedList.length > 0 && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13.5,
                color: T.sub,
                marginBottom: 10,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={showClosed}
                onChange={(e) => setShowClosed(e.target.checked)}
              />
              종료 수업
            </label>
          )}
          <div style={{ flex: 1 }} />
          {savedAt > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12.5,
                color: T.ok,
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              <CheckCircle2 size={14} /> 저장됨
            </div>
          )}
        </div>
      </Card>

      {err && <div style={{ color: T.bad, marginBottom: 12 }}>{err}</div>}

      {!subject || !date ? (
        <Card style={{ padding: 8 }}>
          <Empty icon={<Users size={28} />} text="반과 클리닉 날짜를 선택해주세요" />
        </Card>
      ) : loading ? (
        <div style={{ padding: 30, color: T.muted }}>불러오는 중…</div>
      ) : (
        <>
          <AnswerKeyEditor
            questions={questions}
            setQuestions={(next) => {
              setQuestions(next);
              setDirty(true);
            }}
            dirty={dirty}
            saving={saving}
            onSave={saveKey}
            published={published}
            pastExam={pastExam}
            setPastExam={(v) => {
              setPastExam(v);
              setDirty(true);
            }}
            pastExamSchool={pastExamSchool}
            setPastExamSchool={(v) => {
              setPastExamSchool(v);
              setDirty(true);
            }}
            setPublished={(v) => {
              setPublished(v);
              setDirty(true);
            }}
            onOpenTypeOrder={() => setTypeOrderOpen(true)}
          />

          <TypeOrderModal
            open={typeOrderOpen}
            termId={termId}
            subject={subject}
            onClose={() => setTypeOrderOpen(false)}
          />

          <TestFiles
            termId={termId}
            subject={subject}
            date={date}
            files={files}
            regions={paper?.questionRegions ?? []}
            questionNos={mainQuestionNos}
            onChanged={() => load(true)}
          />

          <Card style={{ padding: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              <Users size={17} color={T.primary} />
              <span style={{ fontSize: 15.5, fontWeight: 800, color: T.ink }}>
                학생별 답안 입력
              </span>
              {summary && (
                <>
                  <Pill tone="primary">응시 {summary.n}명</Pill>
                  <Pill tone="muted">평균 {summary.avg}점</Pill>
                  <Pill tone="ok">최고 {summary.best}점</Pill>
                </>
              )}
              <div style={{ flex: 1 }} />
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  color: T.sub,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(e) => setAutoAdvance(e.target.checked)}
                />
                객관식 자동 이동
              </label>
            </div>

            {!hasKey ? (
              <div
                style={{
                  padding: "14px 16px",
                  background: T.warnSoft,
                  color: T.warn,
                  borderRadius: 10,
                  fontSize: 13.5,
                  fontWeight: 600,
                }}
              >
                먼저 위에서 <b>답안(정답)을 저장</b>하면 학생 답안을 입력할 수 있습니다.
              </div>
            ) : dirty ? (
              <div
                style={{
                  padding: "14px 16px",
                  background: T.warnSoft,
                  color: T.warn,
                  borderRadius: 10,
                  fontSize: 13.5,
                  fontWeight: 600,
                }}
              >
                답안 키가 수정되었습니다. <b>답안 저장 · 재채점</b>을 눌러 반영한 뒤 입력하세요.
              </div>
            ) : visibleRoster.length === 0 ? (
              <Empty icon={<Users size={28} />} text="이 반에 등록된 학생이 없습니다" />
            ) : (
              <>
                <div style={{ fontSize: 12.5, color: T.sub, marginBottom: 10, lineHeight: 1.6 }}>
                  <b>Enter</b> 다음 학생 · <b>← →</b> 문항 이동 · <b>↑ ↓</b> 학생 이동 ·
                  <b> Ctrl+Enter</b> 정답 채우기 · <b>Ctrl+\</b> 안 푸는 문항 표시/해제
                  <div style={{ marginTop: 2 }}>
                    입력하면 자동 저장되고 점수가 바로 채점됩니다. 미응시 학생은 비워 두고,
                    <b> 그 학생만 안 푸는 문항</b>은 Ctrl+\ 로 표시하면 만점에서 빠져
                    나머지 문항으로 100점을 다시 나눕니다.
                  </div>
                </div>
                <AnswerGrid
                  questions={gradable}
                  roster={visibleRoster}
                  answers={answers}
                  excluded={excluded}
                  setAnswer={setAnswer}
                  toggleExcluded={toggleExcluded}
                  autoAdvance={autoAdvance}
                />
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
