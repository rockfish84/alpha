"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Users,
  Inbox,
  CalendarDays,
  ClipboardCheck,
  Pencil,
  Trash2,
  Plus,
  Save,
  Search,
  Eye,
  MessageSquare,
  Send,
  FileText,
  PenLine,
  Image as ImageIcon,
  Link2 as LinkIcon,
  KeyRound,
  Copy,
} from "lucide-react";
import {
  T,
  FONT,
  md,
  attTone,
  pickDefaultDate,
  type Student,
  type ClinicSession,
  type TermInfo,
} from "@/lib/constants";
import { api } from "@/lib/api";
import { getClinicDatesForSubject } from "@/lib/clinic-dates";
import {
  normalizeClosedSubjects,
  visibleSubjects,
} from "@/lib/subject-status";
import { isSchoolExamSubject } from "@/lib/school-exams";
import {
  Btn,
  Card,
  Pill,
  Field,
  Empty,
  Modal,
  SectionTitle,
  MiniToggle,
  Segmented,
  LazyInput,
  inputBase,
  lbl,
} from "./ui";
import { Shell, type NavItem } from "./Shell";
import { AdminScores } from "./AdminScores";
import {
  drawRoundCard,
  drawTestDetailCard,
  drawTrendCard,
  type CardData,
  type CardRound,
} from "@/lib/score-card";

/* ============================== VIEW STATE 저장 ==============================
   선택한 탭·날짜·과목을 브라우저에 저장 → 새로고침해도 보던 화면 유지. */
const ls = {
  get(k: string): string | null {
    try {
      return typeof window !== "undefined" ? window.localStorage.getItem(k) : null;
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};
const LS_TAB = "dubco:admin:tab";
const LS_SUBJECT = "dubco:admin:subject";
const LS_DATE = "dubco:admin:date";

// 저장된 과목/날짜를 복원하되, 현재 학기에 없는 값이면 기본값으로.
function restoreSubject(subjects: string[]): string {
  const saved = ls.get(LS_SUBJECT);
  return saved && subjects.includes(saved) ? saved : subjects[0] ?? "";
}
function restoreDate(clinicDates: string[]): string {
  const saved = ls.get(LS_DATE);
  return saved && clinicDates.includes(saved) ? saved : pickDefaultDate(clinicDates);
}

/* ============================== ATTENDANCE TOGGLE ==============================
   출석 칸을 클릭하면 미제출 → 출석 → 지각 → 결석 → 미제출 순으로 순환.
   관리자가 직접 기록하면 attnAdmin=true 로 저장(학생 제출 여부와 별개). */
function AttToggle({
  submitted,
  attnAdmin,
  attendance,
  lateTime,
  onCycle,
}: {
  submitted: boolean;
  attnAdmin: boolean;
  attendance: "출석" | "지각" | "결석";
  lateTime: string;
  onCycle: (patch: Record<string, any>) => void;
}) {
  const shown = submitted || attnAdmin;
  const tone: "ok" | "warn" | "bad" | "muted" = shown ? attTone[attendance] : "muted";
  const map = {
    ok: [T.okSoft, T.ok],
    warn: [T.warnSoft, T.warn],
    bad: [T.badSoft, T.bad],
    muted: ["#EEF1F6", T.sub],
  } as const;
  const [bg, fg] = map[tone];

  const next = () => {
    if (!shown) return onCycle({ attnAdmin: true, attendance: "출석" });
    if (attendance === "출석") return onCycle({ attnAdmin: true, attendance: "지각" });
    if (attendance === "지각") return onCycle({ attnAdmin: true, attendance: "결석" });
    // 결석 → 미제출로 해제. 단, 학생이 제출한 건은 다시 출석으로 순환(미제출 불가).
    return submitted
      ? onCycle({ attnAdmin: true, attendance: "출석" })
      : onCycle({ attnAdmin: false });
  };

  const label = shown
    ? attendance + (attendance === "지각" && lateTime ? ` ${lateTime}` : "")
    : "미제출";

  return (
    <button
      onClick={next}
      title="클릭하여 출석 상태 변경 (미제출 → 출석 → 지각 → 결석)"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 11px",
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 700,
        fontFamily: FONT,
        background: bg,
        color: fg,
        border: "none",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

/* ============================== RESPONSE DETAIL ============================== */
function ResponseDetail({ r }: { r: ClinicSession }) {
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "9px 0",
        borderBottom: `1px solid ${T.line}`,
        fontSize: 14,
      }}
    >
      <div style={{ width: 110, flexShrink: 0, color: T.sub, fontWeight: 700 }}>
        {k}
      </div>
      <div
        style={{
          color: T.ink,
          whiteSpace: "pre-line",
          minWidth: 0,
          flex: 1,
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {v || <span style={{ color: T.muted }}>—</span>}
      </div>
    </div>
  );
  const srcs = [
    ...r.sources.filter((s) => s !== "기타"),
    r.sources.includes("기타") ? `기타: ${r.sourcesEtc}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const types = [
    ...r.qTypes.filter((s) => s !== "기타"),
    r.qTypes.includes("기타") ? `기타: ${r.qTypesEtc}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <div>
      <Row
        k="출석 여부"
        v={
          r.attendance +
          (r.attendance === "지각" && r.lateTime
            ? ` (${r.lateTime})`
            : r.attendance === "결석" && r.absentReason
            ? ` (${r.absentReason})`
            : "")
        }
      />
      <Row k="질문 출처" v={srcs} />
      <Row k="질문 문제 번호" v={r.qNumbers} />
      <Row k="질문 유형" v={types} />
      <Row k="특별 요청" v={r.request} />
    </div>
  );
}

/* 테스트 점수는 이제 "성적 입력" 탭의 답안 자동 채점으로만 들어온다.
   클리닉 현황·테스트/과제에서는 결과만 보여준다. */
function ScoreView({
  score,
  max,
  auto,
}: {
  score: number | null | undefined;
  max: number | null | undefined;
  auto?: boolean;
}) {
  if (score == null) {
    return <span style={{ color: T.muted, fontSize: 13.5 }}>—</span>;
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 3,
        fontWeight: 800,
        color: T.ink,
        fontSize: 14,
        whiteSpace: "nowrap",
      }}
      title={auto ? "답안 자동 채점 결과" : "이전에 직접 입력한 점수"}
    >
      {score}
      <span style={{ color: T.muted, fontWeight: 500, fontSize: 12.5 }}>
        / {max ?? "?"}
      </span>
      {auto && (
        <span style={{ color: T.ok, fontWeight: 700, fontSize: 11 }}>자동</span>
      )}
    </span>
  );
}

// 점수 입력 파싱: 빈칸→null, 숫자(소수 포함)→그 값, 그 외(NaN)→undefined(무시)
function toNum(v: string): number | null | undefined {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isNaN(n) ? undefined : n;
}

// 과제 O/△/X 토글 묶음 (같은 값 다시 누르면 해제)
function HwToggles({
  value,
  onSet,
}: {
  value: number | null | undefined;
  onSet: (v: number | null) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      <MiniToggle active={value === 1} tone="ok" onClick={() => onSet(value === 1 ? null : 1)} label="O" />
      <MiniToggle active={value === 0.5} tone="warn" onClick={() => onSet(value === 0.5 ? null : 0.5)} label="△" />
      <MiniToggle active={value === 0} tone="bad" onClick={() => onSet(value === 0 ? null : 0)} label="X" />
    </div>
  );
}

/* ============================== 성적 문자 발송 ============================== */
const digits = (v: string) => (v || "").replace(/[^0-9]/g, "");
const phoneOk = (v: string) => /^01[016789][0-9]{7,8}$/.test(digits(v));
const hwLabel = (h: number | null | undefined) =>
  h === 1 ? "완료(O)" : h === 0.5 ? "부분(△)" : h === 0 ? "미수행(X)" : "미입력";

type SendSummary = {
  sent: number;
  failed: number;
  failedList: { to: string; reason: string }[];
  redirectedTo?: string;
};

// N명씩 나눠서 순차 발송 (버스트 완화). 한 묶음이 실패해도 나머지는 계속.
/**
 * 같은 번호가 한 요청에 두 번 들어가면 솔라피가 "중복 수신번호"로 막는다.
 * (이미지 여러 장 · 형제자매가 같은 번호를 쓰는 경우)
 * 그래서 한 묶음 안에서는 번호가 겹치지 않게 나눠 보낸다.
 */
function splitByUniqueTo(
  msgs: { to: string; text: string; image?: string }[],
  size: number
): { to: string; text: string; image?: string }[][] {
  const rest = [...msgs];
  const batches: typeof rest[] = [];
  while (rest.length) {
    const batch: typeof rest = [];
    const used = new Set<string>();
    for (let i = 0; i < rest.length && batch.length < Math.max(1, size); ) {
      const to = digits(rest[i].to);
      if (used.has(to)) {
        i += 1;
        continue;
      }
      used.add(to);
      batch.push(rest.splice(i, 1)[0]);
    }
    batches.push(batch);
  }
  return batches;
}

async function sendBatched(
  msgs: { to: string; text: string; image?: string }[],
  batchSize: number,
  onProgress?: (done: number, total: number) => void
): Promise<SendSummary> {
  let sent = 0;
  let failed = 0;
  const failedList: { to: string; reason: string }[] = [];
  let redirectedTo: string | undefined;
  let done = 0;
  for (const chunk of splitByUniqueTo(msgs, batchSize)) {
    try {
      const res = await api.post("/api/admin/notify", { messages: chunk });
      sent += res.sent ?? 0;
      failed += res.failed ?? 0;
      if (Array.isArray(res.failedList)) failedList.push(...res.failedList);
      if (res.redirectedTo) redirectedTo = res.redirectedTo;
    } catch (e: any) {
      failed += chunk.length;
      chunk.forEach((m) =>
        failedList.push({ to: m.to, reason: e?.message || "요청 실패" })
      );
    }
    done += chunk.length;
    onProgress?.(done, msgs.length);
  }
  return { sent, failed, failedList, redirectedTo };
}

// 발송 결과(성공/실패 + 실패 학생·사유) 표시
function SendResultView({
  result,
  nameByNum,
}: {
  result: SendSummary | null;
  nameByNum: Record<string, string>;
}) {
  if (!result) return null;
  return (
    <div
      style={{
        marginTop: 12,
        border: `1px solid ${T.line}`,
        borderRadius: 10,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 13.5,
          fontWeight: 800,
          color: result.failed ? T.warn : T.ok,
        }}
      >
        {result.failed ? "⚠️" : "✅"} 발송 결과 · 성공 {result.sent}건 / 실패{" "}
        {result.failed}건
        {result.redirectedTo ? ` (안전모드: ${result.redirectedTo} 로 전송)` : ""}
      </div>
      {result.failed > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12.5, color: T.sub, marginBottom: 4, fontWeight: 700 }}>
            실패 명단 (사유):
          </div>
          <div style={{ maxHeight: 160, overflowY: "auto" }}>
            {result.failedList.map((f, i) => (
              <div key={i} style={{ fontSize: 13, color: T.bad, padding: "2px 0" }}>
                · {nameByNum[digits(f.to)] ?? f.to} — {f.reason}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function buildSmsText(
  name: string,
  dateIso: string,
  r: ClinicSession | undefined,
  max: number
) {
  const test = r?.testScore != null ? `${r.testScore}/${r?.testMaxOverride ?? max}` : "미응시";
  return `[더브코 알파 클리닉]\n${name} 학생 · ${md(dateIso)}\n· 과제(프린트): ${hwLabel(r?.hwDone)}\n· 과제(부교재): ${hwLabel(r?.hwSsen)}\n· 테스트: ${test}`;
}

function NotifyModal({
  open,
  onClose,
  rows,
  dateIso,
  subject,
  max,
}: {
  open: boolean;
  onClose: () => void;
  rows: { student: Student; r: ClinicSession | undefined }[];
  dateIso: string;
  subject: string;
  max: number;
}) {
  const [testMode, setTestMode] = useState(true); // 기본: 테스트(내 번호)로 안전하게
  const [testNumber, setTestNumber] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");
  const [summary, setSummary] = useState<SendSummary | null>(null);
  const [lockTo, setLockTo] = useState<string | null>(null); // 서버가 강제하는 테스트 번호

  // 열릴 때 서버 안전장치(SMS_TEST_TO) 여부 확인
  useEffect(() => {
    if (!open) return;
    setNote("");
    setSummary(null);
    api
      .get("/api/admin/notify")
      .then((d) => setLockTo(d?.testTo ?? null))
      .catch(() => setLockTo(null));
  }, [open]);

  const items = rows.map(({ student, r }) => ({
    id: student.id,
    name: student.name,
    num: student.phone ?? "",
    valid: phoneOk(student.phone ?? ""),
    text: buildSmsText(student.name, dateIso, r, max),
  }));
  // 표에서 이미 체크한 학생들 = rows. 테스트 모드가 아니면 번호 유효한 학생만 실제 발송.
  const included = items.filter((it) => testMode || it.valid);
  const nameByNum = testMode
    ? {}
    : Object.fromEntries(included.map((it) => [digits(it.num), it.name]));

  const send = async () => {
    setNote("");
    setSummary(null);
    if (testMode && !phoneOk(testNumber)) {
      setNote("테스트로 받을 번호를 올바르게 입력하세요.");
      return;
    }
    const msgs = included.map((it) => ({
      to: testMode ? testNumber : it.num,
      text: it.text,
    }));
    if (msgs.length === 0) {
      setNote("보낼 대상이 없습니다.");
      return;
    }
    if (
      !confirm(
        `${msgs.length}명에게 ${testMode ? "(테스트) 내 번호로 " : ""}문자를 보낼까요?`
      )
    )
      return;
    setSending(true);
    setNote(`발송 중… 0/${msgs.length}`);
    try {
      const res = await sendBatched(msgs, 30, (done, total) =>
        setNote(`발송 중… ${done}/${total}`)
      );
      setSummary(res);
      setNote("");
    } catch (e: any) {
      setNote(`⚠️ ${e.message || "발송 실패"}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`성적 문자 발송 · ${md(dateIso)} ${subject}`}
      width={620}
    >
      {lockTo && (
        <div
          style={{
            background: T.warnSoft,
            color: T.warn,
            border: `1px solid ${T.warn}`,
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 13,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          🔒 안전 모드: 지금은 부모님이 아니라 <b>{lockTo}</b> 번호로만 발송됩니다.
          <div style={{ fontWeight: 500, marginTop: 3 }}>
            (실전 발송하려면 .env 의 SMS_TEST_TO 를 지우고 서버 재시작)
          </div>
        </div>
      )}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 14,
          fontWeight: 700,
          color: T.ink,
          marginBottom: 10,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={testMode}
          onChange={(e) => setTestMode(e.target.checked)}
        />
        테스트 발송 (부모님 대신 아래 내 번호로 전부 보내기)
      </label>
      {testMode && (
        <input
          style={{ ...inputBase, marginBottom: 12 }}
          inputMode="numeric"
          placeholder="테스트로 받을 내 번호 (예: 01012345678)"
          value={testNumber}
          onChange={(e) => setTestNumber(e.target.value)}
        />
      )}

      <div style={{ fontSize: 13, color: T.sub, marginBottom: 8 }}>
        보낼 대상 {included.length}명
        {!testMode && ` · 번호 없는 학생은 자동 제외`}
      </div>

      <div
        style={{
          maxHeight: 320,
          overflowY: "auto",
          border: `1px solid ${T.line}`,
          borderRadius: 12,
        }}
      >
        {items.map((it, i) => {
          const on = testMode || it.valid; // 실제로 발송될지
          return (
            <div
              key={it.id}
              style={{
                display: "flex",
                gap: 10,
                padding: "10px 12px",
                borderBottom: i < items.length - 1 ? `1px solid ${T.line}` : "none",
                opacity: on ? 1 : 0.5,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: T.ink, fontSize: 14 }}>
                  {it.name}{" "}
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 12.5,
                      color: it.valid ? T.muted : T.bad,
                    }}
                  >
                    {it.valid ? it.num : "번호 없음/형식 오류 (미발송)"}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: T.sub,
                    whiteSpace: "pre-wrap",
                    marginTop: 3,
                  }}
                >
                  {it.text}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {note && (
        <div style={{ marginTop: 12, fontSize: 13.5, fontWeight: 700, color: T.sub }}>
          {note}
        </div>
      )}
      <SendResultView result={summary} nameByNum={nameByNum} />

      <Btn
        onClick={send}
        disabled={sending}
        style={{ width: "100%", justifyContent: "center", marginTop: 14 }}
      >
        <MessageSquare size={16} />
        {sending ? "발송 중…" : testMode ? "테스트 발송" : "부모님께 발송"}
      </Btn>
    </Modal>
  );
}

/* ============================== BOARD ROW (메모) ==============================
   각 행을 React.memo 로 분리 → 한 칸을 저장해도 그 학생 행만 다시 그린다.
   (예전엔 30명 표 전체가 매번 리렌더되어 모바일에서 타자가 밀렸음) */
type BoardRowProps = {
  stu: Student;
  r: ClinicSession | undefined;
  date: string;
  subject: string;
  max: number;
  onSetAdminFields: (
    studentId: string,
    date: string,
    subject: string,
    patch: Record<string, any>
  ) => void;
  onView: (r: ClinicSession) => void;
  onEditing: () => void;
  checked: boolean;
  onToggleSelect: (id: string) => void;
};
const BoardRow = React.memo(function BoardRow({
  stu,
  r,
  date,
  subject,
  max,
  onSetAdminFields,
  onView,
  onEditing,
  checked,
  onToggleSelect,
}: BoardRowProps) {
  const patch = (p: Record<string, any>) => onSetAdminFields(stu.id, date, subject, p);
  return (
    <tr style={{ borderBottom: `1px solid ${T.line}` }}>
      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
        <div style={{ fontWeight: 700, color: T.ink }}>{stu.name}</div>
        <div style={{ fontSize: 12, color: T.muted }}>
          {stu.grade}
          {stu.status === "퇴원" && " · 퇴원"}
        </div>
      </td>
      <td style={{ padding: "10px 12px" }}>
        <AttToggle
          submitted={!!r?.submitted}
          attnAdmin={!!r?.attnAdmin}
          attendance={r?.attendance ?? "출석"}
          lateTime={r?.lateTime ?? ""}
          onCycle={(p) => patch(p)}
        />
      </td>
      <td style={{ padding: "10px 12px" }}>
        {r?.submitted ? (
          r.qNumbers ? (
            <div
              title={r.qNumbers}
              style={{
                maxWidth: 180,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: T.ink,
              }}
            >
              {r.qNumbers}
            </div>
          ) : (
            <span style={{ color: T.muted }}>질문 없음</span>
          )
        ) : (
          <span style={{ color: T.muted }}>—</span>
        )}
      </td>
      <td style={{ padding: "10px 12px" }}>
        <HwToggles value={r?.hwDone} onSet={(v) => patch({ hwDone: v })} />
      </td>
      <td style={{ padding: "10px 12px" }}>
        <HwToggles value={r?.hwSsen} onSet={(v) => patch({ hwSsen: v })} />
      </td>
      <td style={{ padding: "10px 12px", whiteSpace: "nowrap", textAlign: "center" }}>
        <ScoreView
          score={r?.testScore}
          max={r?.testMaxOverride ?? max}
          auto={!!r?.testAuto}
        />
      </td>
      <td style={{ padding: "10px 12px" }}>
        <LazyInput
          value={r?.solved ?? ""}
          placeholder="해결 문제"
          onType={onEditing}
          onCommit={(v) => patch({ solved: v })}
          style={{ ...inputBase, width: 120, padding: "6px 8px" }}
        />
      </td>
      <td style={{ padding: "10px 12px" }}>
        <LazyInput
          value={r?.adminNote ?? ""}
          placeholder="특이사항"
          onType={onEditing}
          onCommit={(v) => patch({ adminNote: v })}
          style={{ ...inputBase, width: 140, padding: "6px 8px" }}
        />
      </td>
      <td style={{ padding: "10px 12px" }}>
        {r?.submitted && (
          <Btn size="xs" variant="soft" onClick={() => onView(r)}>
            <Eye size={14} />
            응답
          </Btn>
        )}
      </td>
      <td style={{ padding: "10px 12px", textAlign: "center" }}>
        <input
          type="checkbox"
          title="문자 발송 대상"
          checked={checked}
          onChange={() => onToggleSelect(stu.id)}
          style={{ width: 18, height: 18, cursor: "pointer" }}
        />
      </td>
    </tr>
  );
});

/* ============================== BOARD ============================== */
function AdminBoard({
  students,
  sessions,
  testMax,
  testDetail,
  additionalMessages,
  clinicDates,
  clinicDatesBySubject,
  subjects,
  closedSubjects,
  onSetAdminFields,
  onSetTestMax,
  onSetTestDetail,
  onSetAdditionalMessage,
  onEditing,
}: {
  students: Student[];
  sessions: ClinicSession[];
  testMax: Record<string, number>;
  testDetail: Record<string, string>;
  additionalMessages: Record<string, string>;
  clinicDates: string[];
  clinicDatesBySubject?: Record<string, string[]>;
  subjects: string[];
  closedSubjects?: string[];
  onSetAdminFields: (
    studentId: string,
    date: string,
    subject: string,
    patch: Record<string, any>
  ) => void;
  onSetTestMax: (
    date: string,
    subject: string,
    val: number | null
  ) => void;
  onSetTestDetail: (date: string, subject: string, str: string) => void;
  onSetAdditionalMessage: (date: string, subject: string, str: string) => void;
  onEditing: () => void;
}) {
  // 종료된 반은 기본으로 숨긴다. 지난 기록 확인이 필요하면 토글로 다시 꺼낸다.
  const [showClosed, setShowClosed] = useState(false);
  const closedList = useMemo(
    () => normalizeClosedSubjects(closedSubjects, subjects),
    [closedSubjects, subjects]
  );
  const pickable = useMemo(
    () => visibleSubjects({ subjects, closedSubjects }, showClosed),
    [subjects, closedSubjects, showClosed]
  );
  const [subject, setSubject] = useState(() => restoreSubject(pickable));
  useEffect(() => {
    setSubject((current) =>
      pickable.includes(current) ? current : pickable[0] ?? ""
    );
  }, [pickable]);
  const subjectClinicDates = useMemo(
    () =>
      getClinicDatesForSubject(
        { clinicDates, clinicDatesBySubject },
        subject
      ),
    [clinicDates, clinicDatesBySubject, subject]
  );
  const [date, setDate] = useState(() => restoreDate(subjectClinicDates));
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState<ClinicSession | null>(null);
  const [notify, setNotify] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set()); // 문자 발송 체크

  const toggleSelect = React.useCallback((id: string) => {
    setSelected((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  // 선택이 바뀌면 저장 (새로고침 후 복원용)
  useEffect(() => {
    if (subject) ls.set(LS_SUBJECT, subject);
  }, [subject]);
  useEffect(() => {
    if (date) ls.set(LS_DATE, date);
  }, [date]);
  useEffect(() => {
    setDate((current) =>
      subjectClinicDates.includes(current)
        ? current
        : restoreDate(subjectClinicDates)
    );
  }, [subjectClinicDates]);
  // 날짜/과목이 바뀌면 발송 체크 초기화
  useEffect(() => {
    setSelected(new Set());
  }, [date, subject]);

  const maxKey = `${date}|${subject}`;
  // 테스트 만점 기본 10 (설정이 있으면 그 값)
  const max = testMax[maxKey] ?? 10;
  const detail = testDetail[maxKey] ?? "";
  const additionalMessage = additionalMessages[maxKey] ?? "";
  const hasClinicDate = !!date && subjectClinicDates.includes(date);
  const roster = hasClinicDate
    ? students
        .filter(
          (s) =>
            (showAll || s.status === "재원") && s.subjects.includes(subject)
        )
        .sort((a, b) => a.name.localeCompare(b.name, "ko"))
    : [];
  const rowFor = (stu: Student) =>
    sessions.find(
      (s) => s.studentId === stu.id && s.date === date && s.subject === subject
    );

  return (
    <div>
      <SectionTitle>클리닉 현황 · 채점</SectionTitle>
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <div style={{ minWidth: 130 }}>
            <div style={lbl}>날짜</div>
            <select
              style={inputBase}
              value={date}
              disabled={!subjectClinicDates.length}
              onChange={(e) => setDate(e.target.value)}
            >
              {subjectClinicDates.length ? (
                subjectClinicDates.map((d) => (
                  <option key={d} value={d}>
                    {md(d)}
                  </option>
                ))
              ) : (
                <option value="">등록된 날짜 없음</option>
              )}
            </select>
          </div>
          <div style={{ minWidth: 120 }}>
            <div style={lbl}>과목</div>
            <select
              style={inputBase}
              value={subject}
              disabled={!pickable.length}
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
          <div style={{ minWidth: 130 }}>
            <div style={lbl}>테스트 만점</div>
            <div
              style={{
                ...inputBase,
                display: "flex",
                alignItems: "center",
                background: "#F6F8FB",
                color: T.sub,
                fontWeight: 700,
              }}
              title="만점은 성적 입력 탭의 배점 합으로 자동 계산됩니다."
            >
              {max}점
            </div>
          </div>
          <div style={{ minWidth: 180, flex: 1 }}>
            <div style={lbl}>테스트 문항 (반 공통)</div>
            <LazyInput
              style={inputBase}
              value={detail}
              placeholder="예: 3,6,9번"
              disabled={!hasClinicDate}
              onType={onEditing}
              onCommit={(v) => onSetTestDetail(date, subject, v)}
            />
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              fontSize: 13.5,
              color: T.sub,
              marginBottom: 10,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />{" "}
            퇴원생 포함
          </label>
          {closedList.length > 0 && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
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
              />{" "}
              종료 수업 포함
            </label>
          )}
        </div>
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: `1px solid ${T.line}`,
          }}
        >
          <div style={lbl}>추가 메시지</div>
          <LazyInput
            multiline
            style={{
              ...inputBase,
              minHeight: 72,
              resize: "vertical",
              lineHeight: 1.5,
            }}
            value={additionalMessage}
            placeholder="이 날짜의 이 수업 문자에만 추가할 내용을 입력하세요."
            disabled={!hasClinicDate}
            onType={onEditing}
            onCommit={(v) => onSetAdditionalMessage(date, subject, v)}
          />
          <div style={{ marginTop: 6, fontSize: 12, color: T.muted }}>
            주간 안내 문자에서 인사말 아래, 성적 내용 위에 표시됩니다.
          </div>
        </div>
      </Card>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
        }}
      >
        {selected.size > 0 && (
          <span style={{ fontSize: 13, color: T.sub, fontWeight: 600 }}>
            {selected.size}명 선택됨
          </span>
        )}
        <Btn
          variant="soft"
          onClick={() => setNotify(true)}
          disabled={selected.size === 0}
        >
          <MessageSquare size={16} />
          성적 문자 발송{selected.size > 0 ? ` (${selected.size})` : ""}
        </Btn>
      </div>

      <Card style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
              minWidth: 1040,
            }}
          >
            <thead>
              <tr style={{ background: "#F6F8FB" }}>
                {["학생", "출석", "질문 문제", "프린트", "부교재", "테스트", "해결 문제", "비고", ""].map(
                  (h, i) => (
                    <th
                      key={i}
                      style={{
                        textAlign: "left",
                        padding: "11px 12px",
                        fontSize: 12.5,
                        fontWeight: 800,
                        color: T.sub,
                        borderBottom: `1px solid ${T.line}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
                <th
                  style={{
                    textAlign: "center",
                    padding: "11px 12px",
                    fontSize: 12.5,
                    fontWeight: 800,
                    color: T.sub,
                    borderBottom: `1px solid ${T.line}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    문자
                    <input
                      type="checkbox"
                      title="전체 선택/해제"
                      checked={roster.length > 0 && roster.every((s) => selected.has(s.id))}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? new Set(roster.map((s) => s.id)) : new Set()
                        )
                      }
                      style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {roster.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <Empty
                      icon={<Users size={28} />}
                      text={
                        !subject
                          ? "진행 중인 수업이 없습니다"
                          : hasClinicDate
                          ? "해당 과목 학생이 없습니다"
                          : "해당 과목에 등록된 클리닉 날짜가 없습니다"
                      }
                    />
                  </td>
                </tr>
              )}
              {roster.map((stu) => (
                <BoardRow
                  key={stu.id}
                  stu={stu}
                  r={rowFor(stu)}
                  date={date}
                  subject={subject}
                  max={max}
                  onSetAdminFields={onSetAdminFields}
                  onView={setView}
                  onEditing={onEditing}
                  checked={selected.has(stu.id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={!!view}
        onClose={() => setView(null)}
        title={
          view
            ? `${
                students.find((s) => s.id === view.studentId)?.name
              } · ${md(view.date)} 응답`
            : ""
        }
      >
        {view && <ResponseDetail r={view} />}
      </Modal>

      <NotifyModal
        open={notify}
        onClose={() => setNotify(false)}
        rows={roster
          .filter((stu) => selected.has(stu.id))
          .map((stu) => ({ student: stu, r: rowFor(stu) }))}
        dateIso={date}
        subject={subject}
        max={max}
      />
    </div>
  );
}

/* ============================== QUICK CARD (메모) ==============================
   빠른입력 카드도 학생별로 메모 → 한 명 저장 시 그 카드만 리렌더. */
type QuickCardProps = {
  stu: Student;
  r: ClinicSession | undefined;
  date: string;
  subject: string;
  max: number;
  onSetAdminFields: (
    studentId: string,
    date: string,
    subject: string,
    patch: Record<string, any>
  ) => void;
  onEditing: () => void;
};
const QuickCard = React.memo(function QuickCard({
  stu,
  r,
  date,
  subject,
  max,
  onSetAdminFields,
  onEditing,
}: QuickCardProps) {
  const patch = (p: Record<string, any>) => onSetAdminFields(stu.id, date, subject, p);
  return (
    <Card style={{ padding: 14, marginBottom: 8 }}>
      {/* 이름 (윗줄) */}
      <div style={{ marginBottom: 12, display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontWeight: 700, color: T.ink, fontSize: 15.5 }}>{stu.name}</span>
        <span style={{ fontSize: 12, color: T.muted }}>
          {stu.grade}
          {stu.status === "퇴원" && " · 퇴원"}
        </span>
      </div>

      {/* 과제 · 테스트 (아랫줄) */}
      <div style={{ display: "flex", gap: 22, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div style={{ ...lbl, marginBottom: 5 }}>과제(프린트)</div>
          <HwToggles value={r?.hwDone} onSet={(v) => patch({ hwDone: v })} />
        </div>

        <div>
          <div style={{ ...lbl, marginBottom: 5 }}>과제(부교재)</div>
          <HwToggles value={r?.hwSsen} onSet={(v) => patch({ hwSsen: v })} />
        </div>

        <div>
          <div style={{ ...lbl, marginBottom: 5 }}>테스트 (자동 채점)</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, minHeight: 30 }}>
            <ScoreView
              score={r?.testScore}
              max={r?.testMaxOverride ?? max}
              auto={!!r?.testAuto}
            />
          </div>
        </div>
      </div>
    </Card>
  );
});

/* ============================== QUICK GRADE (모바일용) ============================== */
function AdminQuickGrade({
  students,
  sessions,
  testMax,
  clinicDates,
  clinicDatesBySubject,
  subjects,
  closedSubjects,
  onSetAdminFields,
  onSetTestMax,
  onEditing,
}: {
  students: Student[];
  sessions: ClinicSession[];
  testMax: Record<string, number>;
  clinicDates: string[];
  clinicDatesBySubject?: Record<string, string[]>;
  subjects: string[];
  closedSubjects?: string[];
  onSetAdminFields: (
    studentId: string,
    date: string,
    subject: string,
    patch: Record<string, any>
  ) => void;
  onSetTestMax: (date: string, subject: string, val: number | null) => void;
  onEditing: () => void;
}) {
  // 종료된 반은 기본으로 숨긴다. 지난 기록 확인이 필요하면 토글로 다시 꺼낸다.
  const [showClosed, setShowClosed] = useState(false);
  const closedList = useMemo(
    () => normalizeClosedSubjects(closedSubjects, subjects),
    [closedSubjects, subjects]
  );
  const pickable = useMemo(
    () => visibleSubjects({ subjects, closedSubjects }, showClosed),
    [subjects, closedSubjects, showClosed]
  );
  const [subject, setSubject] = useState(() => restoreSubject(pickable));
  useEffect(() => {
    setSubject((current) =>
      pickable.includes(current) ? current : pickable[0] ?? ""
    );
  }, [pickable]);
  const subjectClinicDates = useMemo(
    () =>
      getClinicDatesForSubject(
        { clinicDates, clinicDatesBySubject },
        subject
      ),
    [clinicDates, clinicDatesBySubject, subject]
  );
  const [date, setDate] = useState(() => restoreDate(subjectClinicDates));
  const [showAll, setShowAll] = useState(false);

  // 선택이 바뀌면 저장 (새로고침 후 복원용)
  useEffect(() => {
    if (subject) ls.set(LS_SUBJECT, subject);
  }, [subject]);
  useEffect(() => {
    if (date) ls.set(LS_DATE, date);
  }, [date]);
  useEffect(() => {
    setDate((current) =>
      subjectClinicDates.includes(current)
        ? current
        : restoreDate(subjectClinicDates)
    );
  }, [subjectClinicDates]);

  const maxKey = `${date}|${subject}`;
  const max = testMax[maxKey] ?? 10;
  const hasClinicDate = !!date && subjectClinicDates.includes(date);
  const roster = hasClinicDate
    ? students
        .filter(
          (s) =>
            (showAll || s.status === "재원") && s.subjects.includes(subject)
        )
        .sort((a, b) => a.name.localeCompare(b.name, "ko"))
    : [];
  const rowFor = (stu: Student) =>
    sessions.find(
      (s) => s.studentId === stu.id && s.date === date && s.subject === subject
    );

  return (
    <div style={{ maxWidth: 560 }}>
      <SectionTitle>과제 빠른 입력 · 테스트 결과</SectionTitle>

      <Card style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 110 }}>
            <div style={lbl}>날짜</div>
            <select
              style={inputBase}
              value={date}
              disabled={!subjectClinicDates.length}
              onChange={(e) => setDate(e.target.value)}
            >
              {subjectClinicDates.length ? (
                subjectClinicDates.map((d) => (
                  <option key={d} value={d}>
                    {md(d)}
                  </option>
                ))
              ) : (
                <option value="">등록된 날짜 없음</option>
              )}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 110 }}>
            <div style={lbl}>과목</div>
            <select
              style={inputBase}
              value={subject}
              disabled={!pickable.length}
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
          <div style={{ width: 110 }}>
            <div style={lbl}>만점</div>
            <div
              style={{
                ...inputBase,
                display: "flex",
                alignItems: "center",
                background: "#F6F8FB",
                color: T.sub,
                fontWeight: 700,
              }}
              title="만점은 성적 입력 탭의 배점 합으로 자동 계산됩니다."
            >
              {max}점
            </div>
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
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />{" "}
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
              />{" "}
              종료 수업
            </label>
          )}
        </div>
      </Card>

      {roster.length === 0 && (
        <Card style={{ padding: 8 }}>
          <Empty
            icon={<Users size={28} />}
            text={
              !subject
                ? "진행 중인 수업이 없습니다"
                : hasClinicDate
                ? "해당 과목 학생이 없습니다"
                : "해당 과목에 등록된 클리닉 날짜가 없습니다"
            }
          />
        </Card>
      )}

      {roster.map((stu) => (
        <QuickCard
          key={stu.id}
          stu={stu}
          r={rowFor(stu)}
          date={date}
          subject={subject}
          max={max}
          onSetAdminFields={onSetAdminFields}
          onEditing={onEditing}
        />
      ))}
    </div>
  );
}

/* ============================== STUDENTS ============================== */
type EditStudent = Partial<Student> & {
  /** 새 계정의 첫 비밀번호 / 기존 계정의 재설정 값 (비워 두면 그대로 둠) */
  password?: string;
  /** 학부모가 직접 바꾼 비밀번호까지 덮어쓸지 (비밀번호를 잊었을 때) */
  resetParent?: boolean;
};

function StudentForm({
  init,
  subjects,
  closedSubjects,
  onSubmit,
}: {
  init: EditStudent;
  subjects: string[];
  closedSubjects?: string[];
  onSubmit: (v: EditStudent) => void;
}) {
  // 과목은 학기 과목 목록에서만 선택 → 쉼표 포함 과목명("공수1,2 심화")도 정확히 선택되고
  // 예전에 쉼표로 잘못 쪼개진 값은 목록에 없으므로 저장 시 자연히 정리된다.
  const [f, setF] = useState<EditStudent>(() => ({
    ...init,
    password: init.password ?? "",
    subjects: (init.subjects ?? []).filter((s) => subjects.includes(s)),
  }));
  const isEdit = !!init.enrollmentId;
  const set = (k: keyof EditStudent, v: any) =>
    setF((p) => ({ ...p, [k]: v }));
  const toggleSubject = (sub: string) =>
    setF((p) => {
      const cur = p.subjects ?? [];
      return {
        ...p,
        subjects: cur.includes(sub) ? cur.filter((x) => x !== sub) : [...cur, sub],
      };
    });
  const ok = !!f.name && !!f.username && (isEdit || !!f.password || !!f.phone);
  return (
    <div>
      <Field label="이름">
        <input
          style={inputBase}
          value={f.name ?? ""}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="아이디">
            <input
              style={inputBase}
              value={f.username ?? ""}
              onChange={(e) => set("username", e.target.value)}
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="전화번호 (문자 수신)">
            <input
              style={inputBase}
              type="text"
              inputMode="numeric"
              value={f.phone ?? ""}
              placeholder="01012345678"
              onChange={(e) => set("phone", e.target.value)}
            />
          </Field>
        </div>
      </div>
      <Field label={isEdit ? "비밀번호 재설정" : "첫 비밀번호"}>
        <input
          style={inputBase}
          type="text"
          value={f.password ?? ""}
          placeholder={
            isEdit ? "입력한 값으로 새로 설정 (비우면 그대로)" : "비우면 전화번호로 설정"
          }
          onChange={(e) => set("password", e.target.value)}
        />
        <div style={{ fontSize: 12, color: T.sub, marginTop: 6, lineHeight: 1.6 }}>
          비밀번호는 <b>암호화되어 저장</b>되어 관리자도 볼 수 없습니다. 잊었다면 여기서 새로
          설정해 알려 주세요. 학부모 계정은 <b>따로 발급된 아이디(user001…)</b>를 쓰므로 학생
          비밀번호를 바꿔도 영향을 받지 않습니다.
          {isEdit && (
            <label
              style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}
            >
              <input
                type="checkbox"
                checked={!!f.resetParent}
                onChange={(e) => set("resetParent", e.target.checked)}
              />
              학부모 비밀번호 재발급 (숫자 4자리를 새로 만들어 알려 줍니다)
            </label>
          )}
        </div>
      </Field>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="학교">
            <input
              style={inputBase}
              value={f.school ?? ""}
              onChange={(e) => set("school", e.target.value)}
              placeholder="예: 둔산여고"
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="학년">
            <input
              style={inputBase}
              value={f.grade ?? ""}
              onChange={(e) => set("grade", e.target.value)}
              placeholder="예: 고2"
            />
          </Field>
        </div>
      </div>
      <Field label="과목 (여러 개 선택 가능)">
        {subjects.length === 0 ? (
          <span style={{ color: T.muted, fontSize: 13 }}>
            학기에 등록된 과목이 없습니다. (학기 설정에서 과목을 먼저 추가하세요)
          </span>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {subjects.map((sub) => {
              const active = (f.subjects ?? []).includes(sub);
              return (
                <button
                  key={sub}
                  type="button"
                  onClick={() => toggleSubject(sub)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: `1px solid ${active ? T.primary : T.line}`,
                    background: active ? T.primarySoft : "#fff",
                    color: active ? T.primary : T.sub,
                    fontWeight: active ? 800 : 600,
                    fontSize: 13.5,
                    fontFamily: FONT,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {active ? "✓ " : ""}
                  {sub}
                  {(closedSubjects ?? []).includes(sub) ? " (종료)" : ""}
                </button>
              );
            })}
          </div>
        )}
      </Field>
      <Btn
        onClick={() => ok && onSubmit(f)}
        disabled={!ok}
        style={{ width: "100%", justifyContent: "center" }}
      >
        <Save size={16} />
        저장
      </Btn>
    </div>
  );
}

/* ============================== 학부모 계정 안내 ============================== */
/**
 * 재원 학생의 학부모에게 보낼 계정 안내문을 만들어 두는 화면.
 *
 * 여기서는 문자를 보내지 않는다. 안내문을 만들어 복사만 한다.
 * (발송은 학원에서 쓰던 문자 프로그램으로 직접 한다)
 */
const NOTICE_TEMPLATE = `[더브코 알파 클리닉] 학부모 전용 계정 안내

자녀의 클리닉 테스트 성적과 과제 수행 현황을 확인하실 수 있는 학부모 페이지를 안내드립니다.

접속 주소: {사이트}
아이디: {아이디}
비밀번호: {비밀번호}

로그인 화면 상단에서 '학부모' 탭을 선택한 뒤 위 정보를 입력해 주세요.
휴대폰보다 PC로 보시면 성적 그래프와 표가 한눈에 들어와 보기 편합니다.

비밀번호를 잊으셨거나 로그인이 되지 않으시면 본 번호로 문의해 주세요. 확인 후 새로 발급해 드리겠습니다.

감사합니다.`;

const NOTICE_SITE = "http://www.ohyunmin-clinic.com";

function fillNotice(
  template: string,
  student: Student,
  site: string
): string {
  return template
    .replaceAll("{학생}", student.name)
    .replaceAll("{아이디}", student.parentUsername || "(미발급)")
    .replaceAll("{비밀번호}", student.parentPassword || "(재발급 필요)")
    .replaceAll("{사이트}", site);
}

function AdminParentNotice({ students }: { students: Student[] }) {
  // 진행 중인 학기 전체에서 모은 명단 (종료된 반 제외). 못 불러오면 지금 학기만 쓴다.
  const [roster, setRoster] = useState<Student[] | null>(null);
  const [loadNote, setLoadNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const terms: TermInfo[] = await api.get("/api/admin/terms");
        const active = terms.filter((t) => t.active);
        const lists = await Promise.all(
          active.map((t) =>
            api
              .get(`/api/admin/roster?term=${t.id}`)
              .then((rows: Student[]) => ({ term: t, rows }))
          )
        );
        if (cancelled) return;

        // 같은 학생이 두 학기에 다 있으면 한 번만 넣는다.
        const merged = new Map<string, Student>();
        const names: string[] = [];
        for (const { term, rows } of lists) {
          // 종료 처리한 반은 빼고, 지금 돌아가는 반만 남긴다
          const open = visibleSubjects(term, false);
          names.push(`${term.name} (${open.length}개 반)`);
          for (const row of rows) {
            if (row.status !== "재원") continue;
            // 끝난 반만 듣는 학생에게는 보내지 않는다
            if (!row.subjects.some((sub) => open.includes(sub))) continue;
            const prev = merged.get(row.id);
            merged.set(
              row.id,
              prev ? { ...prev, subjects: [...new Set([...prev.subjects, ...row.subjects])] } : row
            );
          }
        }
        setRoster([...merged.values()]);
        setLoadNote(names.join(" · "));
      } catch {
        if (!cancelled) setRoster(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pool = roster ?? students;

  const [template, setTemplate] = useState(NOTICE_TEMPLATE);
  const [site, setSite] = useState(NOTICE_SITE);
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState("");
  // 보낼 학생 (직접 골라야 나간다 — 실수로 전체 발송되지 않도록)
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<SendSummary | null>(null);
  const [smsReady, setSmsReady] = useState<boolean | null>(null);
  const [testTo, setTestTo] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/api/admin/notify")
      .then((d) => {
        setSmsReady(!!d.configured);
        setTestTo(d.testTo ?? null);
      })
      .catch(() => setSmsReady(false));
  }, []);

  // 재원 학생만 대상. 계정이 없거나 비밀번호를 볼 수 없으면 따로 표시한다.
  const targets = useMemo(
    () =>
      pool
        .filter((s) => s.status === "재원")
        .filter((s) => s.name.includes(q) || (s.parentUsername ?? "").includes(q))
        .sort((a, b) => a.name.localeCompare(b.name, "ko")),
    [pool, q]
  );
  const ready = targets.filter((s) => s.parentUsername && s.parentPassword);
  const missing = targets.filter((s) => !s.parentUsername || !s.parentPassword);
  const noPhone = ready.filter((s) => !s.phone);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      alert("복사에 실패했습니다. 직접 선택해 복사해주세요.");
    }
  };

  const sendable = ready.filter((s) => s.phone && picked.has(s.id));
  const allPicked = ready.length > 0 && ready.every((s) => picked.has(s.id));

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** 고른 학생에게만 문자를 보낸다. 누르기 전에 한 번 더 확인한다. */
  const send = async () => {
    if (!sendable.length || sending) return;
    const names = sendable.map((s) => s.name).join(", ");
    const where = testTo ? `\n\n※ 테스트 번호(${testTo})로만 발송됩니다.` : "";
    if (
      !confirm(
        `${sendable.length}명에게 학부모 계정 안내 문자를 보냅니다.\n\n${names}${where}\n\n보낼까요?`
      )
    ) {
      return;
    }
    setSending(true);
    setResult(null);
    setProgress({ done: 0, total: sendable.length });
    try {
      const summary = await sendBatched(
        sendable.map((s) => ({
          to: s.phone as string,
          text: fillNotice(template, s, site),
        })),
        20,
        (done, total) => setProgress({ done, total })
      );
      setResult(summary);
    } catch (e: any) {
      alert(e?.message || "발송에 실패했습니다.");
    } finally {
      setSending(false);
    }
  };

  const nameByNum = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of pool) if (s.phone) map[s.phone] = s.name;
    return map;
  }, [pool]);

  /** 문자 프로그램에 붙여 넣기 좋은 표 (번호 + 안내문) */
  const asTable = () =>
    ready
      .map((s) =>
        [s.phone ?? "", fillNotice(template, s, site).replaceAll("\n", " ")].join("\t")
      )
      .join("\n");

  return (
    <div>
      <SectionTitle>학부모 계정 안내</SectionTitle>

      <div
        style={{
          padding: "11px 14px",
          background: T.primarySoft,
          color: T.primary,
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 700,
          marginBottom: 14,
          lineHeight: 1.6,
        }}
      >
        보낼 학생을 <b>직접 골라야</b> 문자가 나갑니다. 고른 뒤 아래 <b>선택한 N명에게 문자 보내기</b>를
        누르면 한 번 더 확인합니다.
        <div style={{ fontWeight: 500, marginTop: 4 }}>
          대상: 진행 중인 학기의 <b>재원 학생</b>
          {loadNote ? ` — ${loadNote}` : ""}. <b>종료된 반</b>만 듣는 학생은 목록에서 빠집니다.
        </div>
        {testTo && (
          <div style={{ color: T.warn, marginTop: 4 }}>
            지금은 테스트 모드입니다 — 모든 문자가 <b>{testTo}</b> 로만 갑니다
            (.env 의 SMS_TEST_TO).
          </div>
        )}
        {smsReady === false && (
          <div style={{ color: T.bad, marginTop: 4 }}>
            문자 발송 설정이 아직 없습니다 (SOLAPI_API_KEY / SECRET / SENDER). 복사만 가능합니다.
          </div>
        )}
      </div>

      <Card style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ minWidth: 230, flex: 1 }}>
            <div style={lbl}>접속 주소</div>
            <input
              style={inputBase}
              value={site}
              onChange={(e) => setSite(e.target.value)}
            />
          </div>
          <div style={{ minWidth: 180 }}>
            <div style={lbl}>학생 찾기</div>
            <input
              style={inputBase}
              value={q}
              placeholder="이름 또는 아이디"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        <div style={lbl}>안내문 (그대로 쓰거나 고쳐서 쓰세요)</div>
        <textarea
          style={{
            ...inputBase,
            width: "100%",
            minHeight: 160,
            fontFamily: FONT,
            lineHeight: 1.6,
            resize: "vertical",
          }}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        />
        <div style={{ fontSize: 12.5, color: T.sub, marginTop: 6, lineHeight: 1.6 }}>
          <b>{"{학생}"}</b> · <b>{"{아이디}"}</b> · <b>{"{비밀번호}"}</b> · <b>{"{사이트}"}</b>{" "}
          자리에 학생별 값이 들어갑니다.
        </div>
      </Card>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Pill tone="primary">재원 {targets.length}명</Pill>
        <Pill tone="ok">안내 가능 {ready.length}명</Pill>
        {missing.length > 0 && <Pill tone="bad">계정 없음 {missing.length}명</Pill>}
        {noPhone.length > 0 && <Pill tone="warn">번호 없음 {noPhone.length}명</Pill>}
        <div style={{ flex: 1 }} />
        <Btn
          variant="outline"
          size="sm"
          disabled={!ready.length}
          onClick={() => copy(asTable(), "table")}
          title="번호와 안내문을 탭으로 나눠 복사합니다. 엑셀·문자 프로그램에 그대로 붙여 넣으세요."
        >
          <Copy size={14} /> {copied === "table" ? "복사됨" : "번호+안내문 전체 복사"}
        </Btn>
        <Btn
          variant="outline"
          size="sm"
          disabled={!ready.length}
          onClick={() =>
            copy(
              ready.map((s) => fillNotice(template, s, site)).join("\n\n———\n\n"),
              "all"
            )
          }
        >
          <Copy size={14} /> {copied === "all" ? "복사됨" : "안내문 전체 복사"}
        </Btn>
        <Btn
          variant="outline"
          size="sm"
          disabled={!ready.length}
          onClick={() =>
            setPicked(allPicked ? new Set() : new Set(ready.map((s) => s.id)))
          }
        >
          {allPicked ? "선택 해제" : "안내 가능 전체 선택"}
        </Btn>
        <Btn
          size="sm"
          disabled={!sendable.length || sending || smsReady === false}
          onClick={send}
          title="고른 학생의 학부모 번호로 안내 문자를 보냅니다."
        >
          <Send size={14} />
          {sending
            ? `보내는 중… ${progress.done}/${progress.total}`
            : `선택한 ${sendable.length}명에게 문자 보내기`}
        </Btn>
      </div>

      <SendResultView result={result} nameByNum={nameByNum} />

      {missing.length > 0 && (
        <div
          style={{
            padding: "10px 13px",
            background: T.badSoft,
            color: T.bad,
            borderRadius: 9,
            fontSize: 12.5,
            fontWeight: 600,
            marginBottom: 12,
            lineHeight: 1.6,
          }}
        >
          계정이 없거나 비밀번호를 볼 수 없는 학생: {missing.map((s) => s.name).join(", ")}
          <br />
          <span style={{ fontWeight: 500 }}>
            학생 관리 탭에서 그 학생을 수정하며 <b>학부모 비밀번호 재발급</b>을 체크하면 발급됩니다.
          </span>
        </div>
      )}

      <Card style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr>
                {["", "학생", "학부모 번호", "아이디", "비밀번호", "안내문", ""].map((h, i) => (
                  <th
                    key={`${h}-${i}`}
                    style={{
                      textAlign: "left",
                      padding: "10px 14px",
                      fontSize: 12.5,
                      color: T.sub,
                      background: "#F7F9FC",
                      borderBottom: `1px solid ${T.line}`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {targets.map((s) => {
                const ok = !!(s.parentUsername && s.parentPassword);
                const text = fillNotice(template, s, site);
                return (
                  <tr
                    key={s.id}
                    style={{
                      borderBottom: `1px solid ${T.line}`,
                      background: picked.has(s.id) ? T.primarySoft : undefined,
                    }}
                  >
                    <td style={{ padding: "10px 14px", width: 36 }}>
                      <input
                        type="checkbox"
                        checked={picked.has(s.id)}
                        disabled={!ok || !s.phone}
                        onChange={() => toggle(s.id)}
                        title={
                          !ok
                            ? "계정을 먼저 발급해주세요"
                            : !s.phone
                            ? "학부모 번호가 없습니다"
                            : "문자 보낼 학생으로 고르기"
                        }
                      />
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 700, whiteSpace: "nowrap" }}>
                      {s.name}
                      <div style={{ fontSize: 11.5, color: T.muted, fontWeight: 500 }}>
                        {s.school || "—"}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "10px 14px",
                        fontFamily: "monospace",
                        color: s.phone ? T.sub : T.bad,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.phone || "번호 없음"}
                    </td>
                    <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>
                      {s.parentUsername || "—"}
                    </td>
                    <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>
                      {s.parentPassword || (
                        <span style={{ color: T.bad }}>재발급 필요</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "10px 14px",
                        fontSize: 12,
                        color: T.sub,
                        maxWidth: 320,
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.5,
                      }}
                    >
                      {ok ? text : "계정을 먼저 발급해주세요."}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <Btn
                        variant="ghost"
                        size="xs"
                        disabled={!ok}
                        onClick={() => copy(text, s.id)}
                      >
                        <Copy size={13} />
                        {copied === s.id ? "복사됨" : "복사"}
                      </Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!targets.length && <Empty icon={<Users size={28} />} text="재원 중인 학생이 없습니다" />}
      </Card>
    </div>
  );
}

function AdminStudents({
  students,
  subjects,
  closedSubjects,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
}: {
  students: Student[];
  subjects: string[];
  closedSubjects?: string[];
  onAddStudent: (v: EditStudent) => void;
  onUpdateStudent: (id: string, patch: EditStudent) => void;
  onDeleteStudent: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "subject">("name");
  const [subjectFilter, setSubjectFilter] = useState<string>("전체");
  const [editing, setEditing] = useState<EditStudent | null>(null);
  const list = students
    .filter(
      (s) =>
        (subjectFilter === "전체" || s.subjects.includes(subjectFilter)) &&
        (s.name.includes(q) || s.username.includes(q))
    )
    .sort((a, b) => {
      // 퇴원은 정렬과 무관하게 항상 맨 아래.
      if (a.status !== b.status) return a.status === "재원" ? -1 : 1;
      // 특정 과목만 보는 중이면 그냥 가나다순.
      if (subjectFilter === "전체" && sortBy === "subject") {
        const c = a.subjects.join(", ").localeCompare(b.subjects.join(", "), "ko");
        if (c !== 0) return c;
      }
      // 이름순 (과목순일 때도 과목이 같으면 이름으로 2차 정렬)
      return a.name.localeCompare(b.name, "ko");
    });
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <SectionTitle noMargin>
          학생 관리{" "}
          <span style={{ fontSize: 14, color: T.muted, fontWeight: 600 }}>
            ({students.filter((s) => s.status === "재원").length}명 재원)
          </span>
        </SectionTitle>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Segmented
            options={["이름순", "과목순"]}
            value={sortBy === "name" ? "이름순" : "과목순"}
            onChange={(v) => setSortBy(v === "과목순" ? "subject" : "name")}
          />
          <div style={{ position: "relative" }}>
            <Search
              size={16}
              color={T.muted}
              style={{ position: "absolute", left: 11, top: 11 }}
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="이름/아이디 검색"
              style={{ ...inputBase, width: 190, paddingLeft: 34 }}
            />
          </div>
          <Btn
            onClick={() =>
              setEditing({
                name: "",
                username: "",
                password: "",
                grade: "",
                subjects: [],
                status: "재원",
              })
            }
          >
            <Plus size={16} />
            학생 추가
          </Btn>
        </div>
      </div>

      {/* 과목별 필터: 누르면 그 과목 학생만 가나다순 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {["전체", ...subjects].map((sub) => {
          const active = subjectFilter === sub;
          const cnt =
            sub === "전체"
              ? students.filter((s) => s.status === "재원").length
              : students.filter(
                  (s) => s.status === "재원" && s.subjects.includes(sub)
                ).length;
          return (
            <button
              key={sub}
              onClick={() => setSubjectFilter(sub)}
              style={{
                padding: "7px 14px",
                borderRadius: 999,
                border: `1px solid ${active ? T.primary : T.line}`,
                background: active ? T.primarySoft : "#fff",
                color: active ? T.primary : T.sub,
                fontWeight: active ? 800 : 600,
                fontSize: 13.5,
                fontFamily: FONT,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {sub}
              {(closedSubjects ?? []).includes(sub) ? " (종료)" : ""}{" "}
              <span style={{ opacity: 0.7, fontWeight: 600 }}>{cnt}</span>
            </button>
          );
        })}
      </div>

      <Card style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
              minWidth: 620,
            }}
          >
            <thead>
              <tr style={{ background: "#F6F8FB" }}>
                {[
                  "이름",
                  "아이디",
                  "전화번호",
                  "학부모 계정",
                  "학교",
                  "학년",
                  "과목",
                  "상태",
                  "",
                ].map(
                  (h, i) => (
                    <th
                      key={i}
                      style={{
                        textAlign: "left",
                        padding: "11px 14px",
                        fontSize: 12.5,
                        fontWeight: 800,
                        color: T.sub,
                        borderBottom: `1px solid ${T.line}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                  <tr
                    key={s.id}
                    style={{
                      borderBottom: `1px solid ${T.line}`,
                      opacity: s.status === "퇴원" ? 0.6 : 1,
                    }}
                  >
                  <td
                    style={{
                      padding: "11px 14px",
                      fontWeight: 700,
                      color: T.ink,
                    }}
                  >
                    {s.name}
                  </td>
                  <td style={{ padding: "11px 14px", color: T.sub }}>
                    {s.username}
                  </td>
                  <td
                    style={{
                      padding: "11px 14px",
                      color: T.sub,
                      fontFamily: "monospace",
                    }}
                  >
                    {s.phone || "—"}
                  </td>
                  <td
                    style={{
                      padding: "11px 14px",
                      color: s.parentUsername ? T.ink : T.muted,
                      fontFamily: "monospace",
                      whiteSpace: "nowrap",
                    }}
                    title="학원이 발급한 학부모 계정입니다. 학부모는 스스로 비밀번호를 바꿀 수 없습니다."
                  >
                    {s.parentUsername || "—"}
                    {!!s.parentUsername && (
                      <div style={{ fontSize: 12, color: s.parentPassword ? T.sub : T.muted }}>
                        {s.parentPassword || "비밀번호 재발급 필요"}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "11px 14px", color: T.sub, whiteSpace: "nowrap" }}>
                    {s.school || "—"}
                  </td>
                  <td style={{ padding: "11px 14px", color: T.sub }}>
                    {s.grade}
                  </td>
                  <td style={{ padding: "11px 14px", color: T.sub }}>
                    {s.subjects.join(", ")}
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <button
                      onClick={() =>
                        onUpdateStudent(s.enrollmentId!, {
                          status: s.status === "재원" ? "퇴원" : "재원",
                        })
                      }
                      style={{
                        cursor: "pointer",
                        border: "none",
                        background: "transparent",
                        padding: 0,
                      }}
                    >
                      <Pill tone={s.status === "재원" ? "ok" : "muted"}>
                        {s.status}
                      </Pill>
                    </button>
                  </td>
                  <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                    <Btn
                      size="xs"
                      variant="ghost"
                      onClick={() => setEditing(s)}
                    >
                      <Pencil size={14} />
                      수정
                    </Btn>
                    <Btn
                      size="xs"
                      variant="danger"
                      onClick={() =>
                        window.confirm(
                          `${s.name} 학생을 이 학기 명단에서 제외할까요? (계정·다른 학기 기록은 유지)`
                        ) && onDeleteStudent(s.enrollmentId!)
                      }
                    >
                      <Trash2 size={14} />
                    </Btn>
                  </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.enrollmentId ? "학생 정보 수정" : "학생 추가"}
        width={440}
      >
        {editing && (
          <StudentForm
            init={editing}
            subjects={subjects}
            closedSubjects={closedSubjects}
            onSubmit={(v) => {
              if (editing.enrollmentId) onUpdateStudent(editing.enrollmentId, v);
              else onAddStudent(v);
              setEditing(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

/* ============================== SCHOOL EXAMS ============================== */
function AdminSchoolExams({
  term,
  students,
  subjects,
}: {
  term: TermInfo;
  students: Student[];
  subjects: string[];
}) {
  const examSubjects = subjects.filter(isSchoolExamSubject);
  const [subject, setSubject] = useState(examSubjects[0] ?? "");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!subject || !examSubjects.includes(subject)) {
      setSubject(examSubjects[0] ?? "");
    }
  }, [examSubjects.join("|"), subject]);

  if (!term.schoolExamInput || examSubjects.length === 0) {
    return (
      <div>
        <SectionTitle>학교 성적 관리</SectionTitle>
        <Card style={{ padding: 24 }}>
          <Empty
            icon={<FileText size={28} />}
            text="이 학기에는 학교 성적 입력 대상 수업이 없습니다"
          />
        </Card>
      </div>
    );
  }

  const rows = students
    .filter(
      (student) =>
        student.subjects.includes(subject) &&
        (student.name.includes(q) || student.username.includes(q))
    )
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "재원" ? -1 : 1;
      return a.name.localeCompare(b.name, "ko");
    });
  const scoreCell = (value: number | null | undefined) =>
    value == null ? "미입력" : `${value}점`;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <SectionTitle noMargin>
          학교 성적 관리{" "}
          <span style={{ fontSize: 14, color: T.muted, fontWeight: 600 }}>
            ({rows.filter((student) => student.status === "재원").length}명)
          </span>
        </SectionTitle>
        <div style={{ position: "relative" }}>
          <Search
            size={16}
            color={T.muted}
            style={{ position: "absolute", left: 11, top: 11 }}
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름/아이디 검색"
            style={{ ...inputBase, width: 220, paddingLeft: 34 }}
          />
        </div>
      </div>

      <Card
        style={{
          padding: 14,
          marginBottom: 14,
          color: T.sub,
          fontSize: 13.5,
          lineHeight: 1.6,
        }}
      >
        학생이 <b>1학기 성적 입력</b> 탭에서 저장한 학교 과목명·중간·기말·등급을
        조회합니다. 한 학생이 입력한 여러 학교 과목은 각각 별도 행으로 표시됩니다.
      </Card>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {examSubjects.map((examSubject) => {
          const active = subject === examSubject;
          const count = students.filter(
            (student) =>
              student.status === "재원" &&
              student.subjects.includes(examSubject)
          ).length;
          return (
            <button
              key={examSubject}
              onClick={() => setSubject(examSubject)}
              style={{
                padding: "7px 14px",
                borderRadius: 999,
                border: `1px solid ${active ? T.primary : T.line}`,
                background: active ? T.primarySoft : "#fff",
                color: active ? T.primary : T.sub,
                fontWeight: active ? 800 : 600,
                fontSize: 13.5,
                fontFamily: FONT,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {examSubject} <span style={{ opacity: 0.7 }}>{count}</span>
            </button>
          );
        })}
      </div>

      <Card style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
              minWidth: 980,
            }}
          >
            <thead>
              <tr style={{ background: "#F6F8FB" }}>
                {[
                  "이름",
                  "아이디",
                  "학년",
                  "현재 2학기 수강반",
                  "1학기 학교 과목명",
                  "1학기 중간고사 성적",
                  "1학기 기말고사 성적",
                  "1학기 등급",
                  "상태",
                ].map((heading) => (
                  <th
                    key={heading}
                    style={{
                      textAlign: "left",
                      padding: "11px 14px",
                      fontSize: 12.5,
                      fontWeight: 800,
                      color: T.sub,
                      borderBottom: `1px solid ${T.line}`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <Empty
                      icon={<FileText size={28} />}
                      text="해당 수업 학생이 없습니다"
                    />
                  </td>
                </tr>
              )}
              {rows.flatMap((student) => {
                const results = student.schoolExamResults?.length
                  ? student.schoolExamResults
                  : [undefined];
                return results.map((result, resultIndex) => (
                  <tr
                    key={`${student.id}|${resultIndex}`}
                    style={{
                      borderBottom: `1px solid ${T.line}`,
                      opacity: student.status === "퇴원" ? 0.6 : 1,
                    }}
                  >
                    <td style={{ padding: "11px 14px", fontWeight: 700 }}>
                      {student.name}
                    </td>
                    <td style={{ padding: "11px 14px", color: T.sub }}>
                      {student.username}
                    </td>
                    <td style={{ padding: "11px 14px", color: T.sub }}>
                      {student.grade}
                    </td>
                    <td style={{ padding: "11px 14px", color: T.sub }}>
                      {subject}
                    </td>
                    <td
                      style={{
                        padding: "11px 14px",
                        fontWeight: result?.schoolSubjectName ? 700 : 400,
                        color: result?.schoolSubjectName ? T.ink : T.muted,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {result?.schoolSubjectName || "미입력"}
                    </td>
                    <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                      {scoreCell(result?.midtermScore)}
                    </td>
                    <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                      {scoreCell(result?.finalScore)}
                    </td>
                    <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                      {result?.grade || "미입력"}
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <Pill tone={student.status === "재원" ? "ok" : "muted"}>
                        {student.status}
                      </Pill>
                    </td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ============================== RESPONSES ============================== */
function AdminResponses({
  students,
  sessions,
  onDeleteSession,
}: {
  students: Student[];
  sessions: ClinicSession[];
  onDeleteSession: (id: string) => void;
}) {
  const [view, setView] = useState<ClinicSession | null>(null);
  const rows = useMemo(
    () =>
      sessions
        .filter((s) => s.submitted)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [sessions]
  );
  const sName = (id: string) =>
    students.find((s) => s.id === id)?.name ?? "?";
  return (
    <div>
      <SectionTitle>
        제출 응답 관리{" "}
        <span style={{ fontSize: 14, color: T.muted, fontWeight: 600 }}>
          ({rows.length}건)
        </span>
      </SectionTitle>
      <Card style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
              minWidth: 640,
            }}
          >
            <thead>
              <tr style={{ background: "#F6F8FB" }}>
                {["날짜", "학생", "출석", "질문 문제", "유형", ""].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      textAlign: "left",
                      padding: "11px 14px",
                      fontSize: 12.5,
                      fontWeight: 800,
                      color: T.sub,
                      borderBottom: `1px solid ${T.line}`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <Empty
                      icon={<Inbox size={28} />}
                      text="제출된 응답이 없습니다"
                    />
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                  <td
                    style={{
                      padding: "11px 14px",
                      fontWeight: 700,
                      color: T.ink,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {md(r.date)}
                  </td>
                  <td style={{ padding: "11px 14px", color: T.ink }}>
                    {sName(r.studentId)}
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <Pill tone={attTone[r.attendance]}>{r.attendance}</Pill>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    {r.qNumbers ? (
                      <div
                        title={r.qNumbers}
                        style={{
                          maxWidth: 220,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: T.sub,
                        }}
                      >
                        {r.qNumbers}
                      </div>
                    ) : (
                      <span style={{ color: T.muted }}>질문 없음</span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: "11px 14px",
                      color: T.muted,
                      fontSize: 13,
                    }}
                  >
                    {r.qTypes.length ? `${r.qTypes.length}개` : "—"}
                  </td>
                  <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                    <Btn size="xs" variant="soft" onClick={() => setView(r)}>
                      <Eye size={14} />
                      보기
                    </Btn>
                    <Btn
                      size="xs"
                      variant="danger"
                      onClick={() =>
                        window.confirm("이 응답을 삭제하시겠습니까?") &&
                        onDeleteSession(r.id)
                      }
                    >
                      <Trash2 size={14} />
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Modal
        open={!!view}
        onClose={() => setView(null)}
        title={
          view ? `${sName(view.studentId)} · ${md(view.date)} 응답` : ""
        }
      >
        {view && <ResponseDetail r={view} />}
      </Modal>
    </div>
  );
}

/* ============================== 주간 성적 안내 문자 ============================== */
// 과제 진행률 매핑: X(0)→0%, △(0.5)→70%, O(1)→100%
function hwPct(v: number): number {
  return v === 1 ? 100 : v === 0.5 ? 70 : 0;
}

type WeekBlock = {
  dateIso: string;
  subject: string;
  additionalMessage: string;
  hasTest: boolean;
  testPct: number;
  hwDone: number | null;
  hwSsen: number | null;
};

// 한 학생의 (선택 날짜 × 수강 과목) 블록을 조건에 맞게 생성.
function buildStudentBlocks(
  student: Student,
  dates: string[],
  sessions: ClinicSession[],
  additionalMessages: Record<string, string>
): WeekBlock[] {
  const blocks: WeekBlock[] = [];
  for (const dateIso of [...dates].sort()) {
    for (const subject of student.subjects) {
      const r = sessions.find(
        (s) => s.studentId === student.id && s.date === dateIso && s.subject === subject
      );
      if (!r) continue;
      if (r.attendance === "결석") continue; // 조건1: 결석 → 스킵
      const hasTest = r.testScore != null;
      const hasHw = r.hwDone != null || r.hwSsen != null;
      if (!hasTest && !hasHw) continue; // 조건2: 아무것도 표기 안 됨 → 스킵
      const maxv = r.max ?? 10;
      blocks.push({
        dateIso,
        subject,
        additionalMessage: additionalMessages[`${dateIso}|${subject}`] ?? "",
        hasTest, // 조건3: 테스트만 있으면 테스트만
        testPct: hasTest ? Math.round((Number(r.testScore) / maxv) * 100) : 0,
        hwDone: r.hwDone, // 조건4: 과제만 있으면 과제만 (null 은 줄 생략)
        hwSsen: r.hwSsen,
      });
    }
  }
  return blocks;
}

/** 그 회차(날짜·반)의 반 전체 점수 (100점 환산) */
function roundScores(
  sessions: ClinicSession[],
  dateIso: string,
  subject: string
): number[] {
  return sessions
    .filter((s) => s.date === dateIso && s.subject === subject && s.testScore != null)
    .map((s) => Math.round((Number(s.testScore) / (s.max ?? 100)) * 100));
}

/** 문자에 붙일 성적 카드 데이터 (반 평균·최고·등수·추이 포함) */
function buildCardData(
  student: Student,
  blocks: WeekBlock[],
  sessions: ClinicSession[]
): CardData {
  const rounds: CardRound[] = blocks.map((b) => {
    const all = roundScores(sessions, b.dateIso, b.subject);
    const mine = b.hasTest ? b.testPct : null;
    const rank = mine == null ? null : all.filter((v) => v > mine).length + 1;
    return {
      date: b.dateIso,
      subject: b.subject,
      score: mine,
      average: all.length
        ? Math.round(all.reduce((a, v) => a + v, 0) / all.length)
        : null,
      best: all.length ? Math.max(...all) : null,
      rank,
      participants: all.length || null,
      hwDone: b.hwDone,
      hwSsen: b.hwSsen,
    };
  });

  // 추이: 마지막 회차의 반 기준 최근 6회
  const subject = blocks[blocks.length - 1]?.subject ?? student.subjects[0] ?? "";
  const trend = sessions
    .filter(
      (s) => s.studentId === student.id && s.subject === subject && s.testScore != null
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-6)
    .map((s) => {
      const all = roundScores(sessions, s.date, subject);
      return {
        date: s.date,
        score: Math.round((Number(s.testScore) / (s.max ?? 100)) * 100),
        average: all.length
          ? Math.round(all.reduce((a, v) => a + v, 0) / all.length)
          : null,
      };
    });

  return {
    studentName: student.name,
    school: student.school,
    grade: student.grade,
    rounds,
    trend,
  };
}

/**
 * 문자에 넣을 공유 링크의 주소. NEXT_PUBLIC_SITE_URL 이 있으면 그것을,
 * 없으면 지금 보고 있는 사이트 주소를 쓴다.
 */
function shareLinkBase(): string {
  const env = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  if (env) return env;
  return typeof window === "undefined" ? "" : window.location.origin;
}

function isLocalBase(base: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/.test(base);
}

/** 모든 문자에 공통으로 들어가는 인사말 */
function greetingText(subject: string): string {
  return (
    `안녕하세요 더브코 알파 오현민T 조교입니다.\n` +
    `이번 주 ${subject} 퀴즈 점수 및 과제 진행 여부 알려드립니다 :)`
  );
}

/** 회차별 분석 데이터 (문자 이미지용) — /api/admin/round-cards 응답 */
type RoundCardRow = {
  studentId: string;
  name: string;
  school: string;
  grade: string;
  test: any;
};

/**
 * 사진 문자의 "첫 통"에만 들어가는 안내 문구.
 * (솔라피 MMS 는 한 통에 사진 1장 + 빈 문구 불가 → 나머지 사진에는 한 줄 설명만 붙인다)
 */
function imageLeadText(blocks: WeekBlock[]): string {
  const subs = [...new Set(blocks.map((b) => b.subject))].join(", ");
  const additional = blocks
    .map((b) => b.additionalMessage.trim())
    .filter(Boolean)
    .join("\n");
  return [greetingText(subs), additional].filter(Boolean).join("\n\n");
}

/** 한 학생에게 보낼 문자 묶음 (회차 상세 카드 여러 장 + 반별 추이 카드) */
function buildImageMessages(
  student: Student,
  blocks: WeekBlock[],
  sessions: ClinicSession[],
  to: string,
  analysis: Record<string, RoundCardRow[]> = {}
): { to: string; text: string; image: string }[] {
  const card = buildCardData(student, blocks, sessions);
  const who = {
    studentName: card.studentName,
    school: card.school,
    grade: card.grade,
  };
  const out: { to: string; text: string; image: string }[] = [];
  const lead = imageLeadText(blocks);
  // 첫 통에만 인사말을 넣고(그 아래 사진 설명 한 줄),
  // 나머지 사진에는 무슨 사진인지 한 줄만 붙인다.
  const push = (image: string, caption: string) =>
    out.push({
      to,
      text: out.length === 0 ? `${lead}\n\n${caption}` : caption,
      image,
    });

  // 1) 회차(날짜×반)마다 그날 테스트 결과 — 학생 화면의 상세와 같은 내용
  card.rounds.forEach((r, i) => {
    const key = `${blocks[i].dateIso}|${blocks[i].subject}`;
    const row = (analysis[key] ?? []).find((x) => x.studentId === student.id);
    const caption = `${md(blocks[i].dateIso)} ${r.subject} 테스트 성적표`;
    if (row?.test) {
      const t = row.test;
      push(
        drawTestDetailCard({
          ...who,
          subject: t.subject,
          date: t.date,
          hwDone: t.myHwDone ?? r.hwDone,
          hwSsen: t.myHwSsen ?? r.hwSsen,
          maxScore: t.maxScore,
          participants: t.participants,
          myScore: t.myScore,
          myPct: t.myPct,
          myRank: t.myRank,
          avg: t.avg,
          best: t.best,
          distribution: t.distribution ?? [],
          questions: (t.questions ?? []).map((q: any) => ({
            label: q.label,
            type: q.type,
            points: q.points,
            answer: q.answer,
            myAnswer: q.myAnswer,
            myAnswered: q.myAnswered,
            myCorrect: q.myCorrect,
            correctRate: q.correctRate,
            wrongRank: q.wrongRank,
            choiceShares: q.choiceShares ?? [],
          })),
        }),
        caption
      );
    } else {
      // 분석 자료가 없으면 간단 카드로 대체
      push(
        drawRoundCard({
          ...who,
          round: r,
          classScores: roundScores(sessions, blocks[i].dateIso, blocks[i].subject),
        }),
        caption
      );
    }
  });

  // 2) 반마다 점수 추이 한 장 (주간 요약 문구를 함께 보냄)
  const subjects = [...new Set(blocks.map((b) => b.subject))];
  subjects.forEach((subject) => {
    const trend = buildCardData(student, blocks.filter((b) => b.subject === subject), sessions)
      .trend;
    if (!trend.length) return;
    push(drawTrendCard({ ...who, subject, trend }), `${subject} 점수 추이`);
  });

  return out;
}

function buildWeeklyText(blocks: WeekBlock[]): string {
  const subs = [...new Set(blocks.map((b) => b.subject))].join(", ");
  const header =
    `안녕하세요 더브코 알파 오현민T 조교입니다.\n` +
    `이번 주 ${subs} 퀴즈 점수 및 과제 진행 여부 알려드립니다 :)`;
  const additional = blocks
    .map((b) => b.additionalMessage.trim())
    .filter(Boolean)
    .join("\n");
  const body = blocks
    .map((b) => {
      const lines = [`${md(b.dateIso)} ${b.subject}`];
      if (b.hasTest) lines.push(`퀴즈 점수 : ${b.testPct}점`);
      if (b.hwDone != null) lines.push(`과제 (프린트) 진행률 : ${hwPct(b.hwDone)}%`);
      if (b.hwSsen != null) lines.push(`과제 (부교재) 진행률 : ${hwPct(b.hwSsen)}%`);
      return lines.join("\n");
    })
    .join("\n\n");
  return [header, additional, body].filter(Boolean).join("\n\n");
}

function AdminWeekly({
  students,
  sessions,
  clinicDates,
  additionalMessages,
  termId,
}: {
  students: Student[];
  sessions: ClinicSession[];
  clinicDates: string[];
  additionalMessages: Record<string, string>;
  termId: string;
}) {
  const [dates, setDates] = useState<Set<string>>(new Set());
  const [testMode, setTestMode] = useState(true);
  const [testNumber, setTestNumber] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [batchSize, setBatchSize] = useState(30);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState(""); // 검증 메시지·진행 상황
  const [summary, setSummary] = useState<SendSummary | null>(null);
  const [lockTo, setLockTo] = useState<string | null>(null);
  // 성적 카드 이미지 첨부 (MMS)
  const [withImage, setWithImage] = useState(false);
  const [preview, setPreview] = useState<string[] | null>(null);
  // 성적 링크 첨부 (로그인 없이 그 회차만 보는 만료형 링크)
  const [withLink, setWithLink] = useState(false);
  const [linkDays, setLinkDays] = useState(30);

  useEffect(() => {
    api
      .get("/api/admin/notify")
      .then((d) => setLockTo(d?.testTo ?? null))
      .catch(() => setLockTo(null));
  }, []);

  const selDates = [...dates];
  const items = students
    .filter((s) => s.status === "재원")
    .map((s) => {
      const blocks = buildStudentBlocks(s, selDates, sessions, additionalMessages);
      return {
        id: s.id,
        name: s.name,
        num: s.phone ?? "",
        valid: phoneOk(s.phone ?? ""),
        blocks,
        text: blocks.length ? buildWeeklyText(blocks) : "",
        student: s,
      };
    })
    .filter((it) => it.blocks.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const included = items.filter(
    (it) => !excluded.has(it.id) && (testMode || it.valid)
  );
  const toggle = (id: string) =>
    setExcluded((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const nameByNum = testMode
    ? {}
    : Object.fromEntries(included.map((it) => [digits(it.num), it.name]));

  /** 선택한 회차들의 분석 데이터를 한 번씩 받아 둔다 (문자 이미지용) */
  const loadAnalysis = async (): Promise<Record<string, RoundCardRow[]>> => {
    const keys = new Set<string>();
    for (const it of included) {
      for (const b of it.blocks) keys.add(`${b.dateIso}|${b.subject}`);
    }
    const out: Record<string, RoundCardRow[]> = {};
    let done = 0;
    for (const key of keys) {
      const [date, subject] = key.split("|");
      setNote(`성적 자료를 모으는 중… ${++done}/${keys.size}`);
      try {
        const d = await api.get(
          `/api/admin/round-cards?term=${termId}&subject=${encodeURIComponent(
            subject
          )}&date=${date}`
        );
        out[key] = d.students ?? [];
      } catch {
        out[key] = [];
      }
    }
    setNote("");
    return out;
  };

  /** 고른 회차마다 학생별 공유 링크를 발급받아 "학생|반|날짜 → URL" 로 돌려준다. */
  const loadLinks = async (): Promise<Record<string, string>> => {
    // 문자에 들어갈 주소가 localhost 면 학부모 휴대폰에서 열리지 않는다.
    // (테스트 발송은 내 번호로만 가므로 흐름 확인용으로 허용)
    if (!testMode && isLocalBase(shareLinkBase())) {
      throw new Error(
        "지금 주소(localhost)로는 문자 속 링크가 휴대폰에서 열리지 않습니다. " +
          "배포된 사이트 주소로 접속해서 보내거나, .env 에 NEXT_PUBLIC_SITE_URL 을 설정하세요."
      );
    }
    const items: { studentId: string; subject: string; date: string }[] = [];
    for (const it of included) {
      for (const b of it.blocks) {
        items.push({ studentId: it.id, subject: b.subject, date: b.dateIso });
      }
    }
    if (!items.length) return {};
    setNote("성적 링크를 만드는 중…");
    const d = await api.post("/api/admin/share-links", {
      term: termId,
      days: linkDays,
      items,
    });
    const origin = shareLinkBase();
    const out: Record<string, string> = {};
    for (const l of d.links ?? []) {
      out[`${l.studentId}|${l.subject}|${l.date}`] = `${origin}/share/${l.token}`;
    }
    setNote("");
    return out;
  };

  const send = async () => {
    setNote("");
    setSummary(null);
    if (testMode && !phoneOk(testNumber)) {
      setNote("테스트로 받을 번호를 올바르게 입력하세요.");
      return;
    }
    const analysis = withImage ? await loadAnalysis() : {};
    let links: Record<string, string> = {};
    if (withLink) {
      try {
        links = await loadLinks();
      } catch (e: any) {
        setNote(`⚠️ ${e?.message || "성적 링크를 만들지 못했습니다."}`);
        return;
      }
    }
    const linkLines = (it: (typeof included)[number]) =>
      withLink
        ? it.blocks
            .map((b) => {
              const url = links[`${it.id}|${b.subject}|${b.dateIso}`];
              return url ? `${md(b.dateIso)} ${b.subject} 성적 보기\n${url}` : "";
            })
            .filter(Boolean)
            .join("\n\n")
        : "";
    const withLinks = (text: string, it: (typeof included)[number]) => {
      const lines = linkLines(it);
      return lines ? `${text}\n\n${lines}` : text;
    };
    const msgs = withImage
      ? included.flatMap((it) => {
          const list = buildImageMessages(
            it.student,
            it.blocks,
            sessions,
            testMode ? testNumber : it.num,
            analysis
          );
          // 링크는 첫 통(인사말)에만 붙인다.
          return list.map((m, i) =>
            i === 0 ? { ...m, text: withLinks(m.text, it) } : m
          );
        })
      : included.map((it) => ({
          to: testMode ? testNumber : it.num,
          text: withLinks(it.text, it),
        }));
    if (msgs.length === 0) {
      setNote("보낼 대상이 없습니다.");
      return;
    }
    // 이미지가 붙으면 요청 용량이 커져 한 번에 적게 보낸다.
    const size = withImage ? Math.min(batchSize, 5) : batchSize;
    if (
      !confirm(
        withImage
          ? `학생 ${included.length}명에게 사진 문자 ${msgs.length}건을 보낼까요?\n` +
              `(회차별 성적 + 반별 점수 추이 · 건당 약 60원 · 예상 ${msgs.length * 60}원)`
          : `${msgs.length}명에게 ${testMode ? "(테스트) 내 번호로 " : ""}${size}명씩 나눠 보낼까요?`
      )
    )
      return;
    setSending(true);
    setNote(`발송 중… 0/${msgs.length}`);
    try {
      const res = await sendBatched(msgs, size, (done, total) =>
        setNote(`발송 중… ${done}/${total}`)
      );
      setSummary(res);
      setNote("");
    } catch (e: any) {
      setNote(`⚠️ ${e.message || "발송 실패"}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <SectionTitle>주간 성적 안내 문자</SectionTitle>

      <Card style={{ padding: 16, marginBottom: 14 }}>
        <div style={lbl}>보낼 날짜 선택 (여러 날 묶어서 한 문자로)</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
          {clinicDates.map((d) => {
            const on = dates.has(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() =>
                  setDates((p) => {
                    const n = new Set(p);
                    n.has(d) ? n.delete(d) : n.add(d);
                    return n;
                  })
                }
                style={{
                  padding: "7px 13px",
                  borderRadius: 999,
                  border: `1px solid ${on ? T.primary : T.line}`,
                  background: on ? T.primarySoft : "#fff",
                  color: on ? T.primary : T.sub,
                  fontWeight: on ? 800 : 600,
                  fontSize: 13.5,
                  fontFamily: FONT,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {on ? "✓ " : ""}
                {md(d)}
              </button>
            );
          })}
        </div>
      </Card>

      <Card style={{ padding: 16, marginBottom: 14 }}>
        {lockTo && (
          <div
            style={{
              background: T.warnSoft,
              color: T.warn,
              border: `1px solid ${T.warn}`,
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 13,
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            🔒 안전 모드: 지금은 부모님이 아니라 <b>{lockTo}</b> 번호로만 발송됩니다.
          </div>
        )}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 14,
            fontWeight: 700,
            color: T.ink,
            marginBottom: 10,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={testMode}
            onChange={(e) => setTestMode(e.target.checked)}
          />
          테스트 발송 (부모님 대신 아래 내 번호로 전부 보내기)
        </label>
        {testMode && (
          <input
            style={{ ...inputBase, marginBottom: 10 }}
            inputMode="numeric"
            placeholder="테스트로 받을 내 번호 (예: 01012345678)"
            value={testNumber}
            onChange={(e) => setTestNumber(e.target.value)}
          />
        )}

        {/* 성적 링크 첨부 (로그인 없이 보는 만료형 링크) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            padding: "10px 12px",
            background: withLink ? T.primarySoft : "#F6F8FB",
            borderRadius: 10,
            marginBottom: 10,
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
              fontWeight: 700,
              color: T.ink,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={withLink}
              onChange={(e) => setWithLink(e.target.checked)}
            />
            <LinkIcon size={16} />
            성적 링크 첨부
          </label>
          <span style={{ fontSize: 12.5, color: T.sub }}>
            문자 본문에 <b>로그인 없이 그 회차 성적만</b> 보는 링크를 붙입니다. 사진과 달리
            화질 제한이 없고, 문자 한 통이면 됩니다.
          </span>
          <div style={{ flex: 1 }} />
          <label style={{ fontSize: 12.5, color: T.sub, display: "flex", alignItems: "center", gap: 6 }}>
            유효기간
            <input
              type="number"
              min={1}
              max={180}
              value={linkDays}
              onChange={(e) => setLinkDays(Math.max(1, Math.min(180, Number(e.target.value) || 30)))}
              style={{
                width: 64,
                padding: "5px 8px",
                border: `1px solid ${T.line}`,
                borderRadius: 8,
                fontSize: 13,
                fontFamily: FONT,
              }}
            />
            일
          </label>
        </div>

        {/* 성적 카드 이미지 첨부 (사진 문자) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            padding: "10px 12px",
            background: withImage ? T.primarySoft : "#F6F8FB",
            borderRadius: 10,
            marginBottom: 10,
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
              fontWeight: 700,
              color: T.ink,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={withImage}
              onChange={(e) => setWithImage(e.target.checked)}
            />
            <ImageIcon size={16} />
            성적 카드 이미지 첨부
          </label>
          <span style={{ fontSize: 12.5, color: T.sub }}>
            고른 날짜마다 <b>그날 테스트 결과</b>(점수·반 평균·등수·분포·과제)를 한 장씩,
            그리고 반마다 <b>점수 추이</b>를 한 장 더 보냅니다. 사진 문자(MMS)로 나가며
            <b> 건당 약 60원</b>입니다.
          </span>
          <div style={{ flex: 1 }} />
          <Btn
            variant="outline"
            size="sm"
            disabled={included.length === 0}
            onClick={async () => {
              const first = included[0];
              if (!first) return;
              try {
                const analysis = await loadAnalysis();
                setPreview(
                  buildImageMessages(
                    first.student,
                    first.blocks,
                    sessions,
                    "01000000000",
                    analysis
                  ).map((m) => m.image)
                );
              } catch (e: any) {
                setNote(e?.message || "미리보기를 만들지 못했습니다.");
              }
            }}
          >
            <Eye size={14} />
            미리보기
          </Btn>
        </div>

        <Modal
          open={!!preview?.length}
          onClose={() => setPreview(null)}
          title={`성적 카드 미리보기 (첫 번째 학생 · ${preview?.length ?? 0}장)`}
          width={720}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {(preview ?? []).map((src, i) => (
              <div key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`성적 카드 ${i + 1}`}
                  style={{ width: "100%", borderRadius: 12, border: `1px solid ${T.line}` }}
                />
                <div style={{ fontSize: 12.5, color: T.muted, marginTop: 6 }}>
                  {i + 1}번째 · 약{" "}
                  {Math.round(((src.length - src.indexOf(",") - 1) * 3) / 4 / 1024)}KB
                  (제한 200KB)
                </div>
              </div>
            ))}
          </div>
        </Modal>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: T.sub, fontWeight: 600 }}>
            한 번에 보낼 인원 (나눠 보내기)
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={batchSize}
            onChange={(e) => setBatchSize(Math.max(1, Number(e.target.value) || 1))}
            style={{ ...inputBase, width: 80, textAlign: "center" }}
          />
          <span style={{ fontSize: 12, color: T.muted }}>
            명씩 순차 발송 (대량 스팸차단 완화용, 기본 30)
          </span>
        </div>
      </Card>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13.5, color: T.sub, fontWeight: 600 }}>
            {selDates.length === 0
              ? "먼저 위에서 날짜를 선택하세요."
              : `발송 대상 ${included.length}명 (내용 있는 학생만 표시)`}
          </div>
          {items.length > 0 && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13.5,
                fontWeight: 700,
                color: T.sub,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={items.every((it) => !excluded.has(it.id))}
                onChange={(e) =>
                  setExcluded(
                    e.target.checked ? new Set() : new Set(items.map((it) => it.id))
                  )
                }
                style={{ width: 16, height: 16, cursor: "pointer" }}
              />
              전체 선택/해제
            </label>
          )}
        </div>
        <Btn onClick={send} disabled={sending || included.length === 0}>
          <Send size={16} />
          {sending ? "발송 중…" : `문자 발송 (${included.length})`}
        </Btn>
      </div>

      {note && (
        <div style={{ marginBottom: 8, fontSize: 13.5, fontWeight: 700, color: T.sub }}>
          {note}
        </div>
      )}
      <SendResultView result={summary} nameByNum={nameByNum} />

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {selDates.length > 0 && items.length === 0 && (
          <Card style={{ padding: 8 }}>
            <Empty icon={<Inbox size={28} />} text="선택한 날짜에 보낼 내용이 있는 학생이 없습니다" />
          </Card>
        )}
        {items.map((it) => {
          const on = !excluded.has(it.id) && (testMode || it.valid);
          return (
            <Card key={it.id} style={{ padding: 14, opacity: on ? 1 : 0.55 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!testMode && !it.valid}
                  onChange={() => toggle(it.id)}
                  style={{ width: 18, height: 18, cursor: "pointer" }}
                />
                <span style={{ fontWeight: 800, color: T.ink, fontSize: 15 }}>
                  {it.name}
                </span>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: it.valid ? T.muted : T.bad,
                  }}
                >
                  {it.valid ? it.num : "번호 없음/형식 오류 (미발송)"}
                </span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: T.ink,
                  whiteSpace: "pre-wrap",
                  background: "#F6F8FB",
                  border: `1px solid ${T.line}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  lineHeight: 1.5,
                }}
              >
                {it.text}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ============================== PORTAL ============================== */
/* ============================== TERMS (학기 관리) ============================== */
function AdminTerms({
  terms,
  onCreate,
  onUpdate,
  onDelete,
}: {
  terms: TermInfo[];
  onCreate: (body: any) => Promise<void>;
  onUpdate: (id: string, patch: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [copyRoster, setCopyRoster] = useState(true);
  const [editing, setEditing] = useState<TermInfo | null>(null);

  const submitNew = async () => {
    if (!name.trim()) return;
    await onCreate({
      name: name.trim(),
      copyFrom: copyFrom || undefined,
      copyRoster,
      activate: true,
    });
    setName("");
    setCopyFrom("");
    setCreating(false);
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <SectionTitle noMargin>학기 관리</SectionTitle>
        <Btn onClick={() => setCreating((v) => !v)}>
          <Plus size={16} />새 학기
        </Btn>
      </div>

      {creating && (
        <Card style={{ padding: 18, marginBottom: 16 }}>
          <Field label="학기 이름">
            <input
              style={inputBase}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 2026 가을"
            />
          </Field>
          <Field label="이전 학기에서 복사 (선택)">
            <select
              style={inputBase}
              value={copyFrom}
              onChange={(e) => setCopyFrom(e.target.value)}
            >
              <option value="">복사 안 함 (빈 학기)</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          {copyFrom && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 14,
                color: T.sub,
                marginBottom: 14,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={copyRoster}
                onChange={(e) => setCopyRoster(e.target.checked)}
              />
              반·클리닉날짜와 <b>명단까지</b> 복사 (해제 시 반·날짜만)
            </label>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={submitNew} disabled={!name.trim()}>
              <Save size={16} />
              만들기 (진행 시작)
            </Btn>
            <Btn variant="outline" onClick={() => setCreating(false)}>
              취소
            </Btn>
          </div>
        </Card>
      )}

      <Card style={{ overflow: "hidden" }}>
        {terms.length === 0 && (
          <Empty icon={<CalendarDays size={28} />} text="학기가 없습니다" />
        )}
        {terms.map((t) => (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "14px 16px",
              borderBottom: `1px solid ${T.line}`,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 800, color: T.ink, fontSize: 15 }}>
                  {t.name}
                </span>
                {t.active && <Pill tone="ok">진행중</Pill>}
              </div>
              <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}>
                반 {t.subjects.length}개 · 클리닉 {t.clinicDates.length}일
                {t.closedSubjects && t.closedSubjects.length > 0
                  ? ` · 종료된 반 ${t.closedSubjects.length}개`
                  : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn
                size="sm"
                variant={t.active ? "outline" : "soft"}
                onClick={() => onUpdate(t.id, { active: !t.active })}
              >
                {t.active ? "진행 종료" : "진행 시작"}
              </Btn>
              <Btn size="sm" variant="outline" onClick={() => setEditing(t)}>
                <Pencil size={14} />설정
              </Btn>
              <Btn
                size="sm"
                variant="danger"
                onClick={() =>
                  window.confirm(
                    `'${t.name}' 학기와 그 학기의 등록·기록을 모두 삭제할까요? (계정은 유지)`
                  ) && onDelete(t.id)
                }
              >
                <Trash2 size={14} />
              </Btn>
            </div>
          </div>
        ))}
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `${editing.name} · 설정` : ""}
        width={520}
      >
        {editing && (
          <TermSettingsForm
            term={editing}
            onSubmit={async (patch) => {
              await onUpdate(editing.id, patch);
              setEditing(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

type SubjectRow = { subject: string; dates: string[]; closed: boolean };

/** 설정 폼 초기 행. 과목별 일정이 아직 없는 기존 학기는 학기 공통 날짜를 그대로 물려받는다. */
function buildSubjectRows(term: TermInfo): SubjectRow[] {
  const bySubject = term.clinicDatesBySubject ?? {};
  const hasSubjectDates = term.subjects.some((s) =>
    Object.prototype.hasOwnProperty.call(bySubject, s)
  );
  const closed = new Set(term.closedSubjects ?? []);
  return term.subjects.map((subject) => ({
    subject,
    dates: [
      ...(bySubject[subject] ?? (hasSubjectDates ? [] : term.clinicDates)),
    ].sort(),
    closed: closed.has(subject),
  }));
}

const dateChip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "5px 10px",
  background: T.primarySoft,
  color: T.primary,
  borderRadius: 999,
  fontSize: 12.5,
  fontWeight: 700,
};

function TermSettingsForm({
  term,
  onSubmit,
}: {
  term: TermInfo;
  onSubmit: (patch: any) => Promise<void>;
}) {
  const [name, setName] = useState(term.name);
  // 반 목록 · 반별 클리닉 날짜 · 반별 진행/종료를 한 화면에서 관리한다.
  const [rows, setRows] = useState<SubjectRow[]>(() => buildSubjectRows(term));
  const [newSubject, setNewSubject] = useState("");
  const [dateDraft, setDateDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const patchRow = (subject: string, patch: Partial<SubjectRow>) =>
    setRows((p) =>
      p.map((r) => (r.subject === subject ? { ...r, ...patch } : r))
    );

  const addDate = (row: SubjectRow) => {
    const d = (dateDraft[row.subject] ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || row.dates.includes(d)) return;
    patchRow(row.subject, { dates: [...row.dates, d].sort() });
    setDateDraft((p) => ({ ...p, [row.subject]: "" }));
  };

  const addSubject = () => {
    const s = newSubject.trim();
    if (!s || rows.some((r) => r.subject === s)) return;
    setRows((p) => [...p, { subject: s, dates: [], closed: false }]);
    setNewSubject("");
  };

  const removeSubject = (row: SubjectRow) => {
    if (
      !window.confirm(
        `'${row.subject}' 반을 이 학기에서 빼고 이 반의 클리닉 날짜도 지울까요? (이미 쌓인 기록은 남습니다)`
      )
    )
      return;
    setRows((p) => p.filter((r) => r.subject !== row.subject));
  };

  const save = async () => {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        name,
        subjects: rows.map((r) => r.subject),
        closedSubjects: rows.filter((r) => r.closed).map((r) => r.subject),
      };
      // 반이 하나도 없으면 학기 공통 날짜는 건드리지 않는다.
      if (rows.length) {
        patch.clinicDatesBySubject = Object.fromEntries(
          rows.map((r) => [r.subject, r.dates])
        );
      }
      await onSubmit(patch);
    } finally {
      setSaving(false);
    }
  };

  const openCnt = rows.filter((r) => !r.closed).length;

  return (
    <div>
      <Field label="학기 이름">
        <input
          style={inputBase}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <Field
        label={`반별 진행 상태 · 클리닉 날짜 (진행 ${openCnt} · 종료 ${
          rows.length - openCnt
        })`}
      >
        {rows.length === 0 ? (
          <div style={{ color: T.muted, fontSize: 13 }}>
            등록된 반이 없습니다. 아래에서 반을 추가하세요.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {rows.map((row) => (
              <details
                key={row.subject}
                style={{
                  border: `1px solid ${T.line}`,
                  borderRadius: 10,
                  padding: "9px 11px",
                  background: row.closed ? "#F4F6F9" : "#F8FAFD",
                }}
              >
                <summary style={{ cursor: "pointer" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      flexWrap: "wrap",
                    }}
                  >
                    <b style={{ color: row.closed ? T.sub : T.ink, fontSize: 14 }}>
                      {row.subject}
                    </b>
                    <Pill tone={row.closed ? "muted" : "ok"}>
                      {row.closed ? "종료" : "진행중"}
                    </Pill>
                    <span style={{ color: T.muted, fontSize: 12.5, fontWeight: 600 }}>
                      클리닉 {row.dates.length}일
                    </span>
                  </span>
                </summary>

                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    marginTop: 10,
                  }}
                >
                  <Btn
                    size="sm"
                    variant={row.closed ? "soft" : "outline"}
                    onClick={() => patchRow(row.subject, { closed: !row.closed })}
                  >
                    {row.closed ? "진행 시작" : "진행 종료"}
                  </Btn>
                  <Btn size="sm" variant="danger" onClick={() => removeSubject(row)}>
                    <Trash2 size={14} />반 삭제
                  </Btn>
                </div>

                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <input
                    type="date"
                    style={{ ...inputBase, flex: 1 }}
                    value={dateDraft[row.subject] ?? ""}
                    onChange={(e) =>
                      setDateDraft((p) => ({ ...p, [row.subject]: e.target.value }))
                    }
                  />
                  <Btn variant="soft" onClick={() => addDate(row)}>
                    <Plus size={15} />추가
                  </Btn>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginTop: 8,
                  }}
                >
                  {row.dates.length === 0 ? (
                    <span style={{ color: T.muted, fontSize: 12.5 }}>
                      등록된 날짜가 없습니다.
                    </span>
                  ) : (
                    row.dates.map((d) => (
                      <span key={d} style={dateChip}>
                        {md(d)}
                        <button
                          onClick={() =>
                            patchRow(row.subject, {
                              dates: row.dates.filter((x) => x !== d),
                            })
                          }
                          style={{
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            color: T.primary,
                            display: "flex",
                            padding: 0,
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
        <div style={{ color: T.sub, fontSize: 12.5, marginTop: 8 }}>
          종료한 반은 클리닉 현황·테스트/과제와 학생 입력 화면에서 사라지고,
          학생은 그 반에 새 응답을 제출할 수 없습니다. 쌓인 기록은 그대로 남습니다.
        </div>
      </Field>

      <Field label="반 추가">
        <div style={{ display: "flex", gap: 6 }}>
          <input
            style={{ ...inputBase, flex: 1 }}
            value={newSubject}
            placeholder="예: 고1 공수2"
            onChange={(e) => setNewSubject(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSubject();
              }
            }}
          />
          <Btn variant="soft" onClick={addSubject} disabled={!newSubject.trim()}>
            <Plus size={15} />추가
          </Btn>
        </div>
        <div style={{ color: T.sub, fontSize: 12.5, marginTop: 6 }}>
          반 이름은 학생 등록·기록과 연결되어 있어 여기서 바꿀 수 없습니다.
        </div>
      </Field>

      <Btn
        onClick={save}
        disabled={saving}
        style={{ width: "100%", justifyContent: "center" }}
      >
        <Save size={16} />
        {saving ? "저장 중…" : "저장"}
      </Btn>
    </div>
  );
}

export function AdminPortal({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState(() => ls.get(LS_TAB) || "board");
  const [terms, setTerms] = useState<TermInfo[]>([]);
  const [termId, setTermId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<ClinicSession[]>([]);
  const [testMax, setTestMax] = useState<Record<string, number>>({});
  const [testDetail, setTestDetail] = useState<Record<string, string>>({});
  const [additionalMessages, setAdditionalMessages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // 선택한 탭 저장 (새로고침 후 복원용)
  useEffect(() => {
    ls.set(LS_TAB, tab);
  }, [tab]);

  const term = terms.find((t) => t.id === termId);
  const subjects = term?.subjects ?? [];
  const clinicDates = term?.clinicDates ?? [];
  const tq = termId ? `?term=${termId}` : "";

  // 마지막으로 관리자가 직접 입력한 시각 (자동 새로고침이 입력을 덮어쓰지 않도록)
  const lastEditRef = useRef(0);

  const reloadStudents = async () =>
    setStudents(await api.get(`/api/admin/roster${tq}`));
  const reloadSessions = async () =>
    setSessions(await api.get(`/api/admin/sessions${tq}`));
  const reloadTestMax = async () => {
    const d = await api.get(`/api/admin/testconfig${tq}`);
    setTestMax(d.max ?? {});
    setTestDetail(d.detail ?? {});
    setAdditionalMessages(d.additionalMessage ?? {});
  };
  const reloadTerms = async () => {
    const ts: TermInfo[] = await api.get("/api/admin/terms");
    setTerms(ts);
    return ts;
  };

  // 최초: 학기 목록 로드 → 활성 학기 선택
  useEffect(() => {
    (async () => {
      try {
        const ts = await reloadTerms();
        const active = ts.find((t) => t.active) ?? ts[0];
        setTermId(active?.id ?? "");
        if (!active) setLoading(false);
      } catch (e: any) {
        setErr(e.message || "데이터를 불러오지 못했습니다.");
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 학기 선택 시: 명단·세션·만점 로드
  useEffect(() => {
    if (!termId) return;
    let cancelled = false;
    setErr("");
    setLoading(true);
    Promise.all([
      api.get(`/api/admin/roster?term=${termId}`),
      api.get(`/api/admin/sessions?term=${termId}`),
      api.get(`/api/admin/testconfig?term=${termId}`),
    ])
      .then(([st, se, tm]) => {
        if (cancelled) return;
        setStudents(st);
        setSessions(se);
        setTestMax(tm.max ?? {});
        setTestDetail(tm.detail ?? {});
        setAdditionalMessages(tm.additionalMessage ?? {});
      })
      .catch((e: any) => {
        if (!cancelled) setErr(e.message || "데이터를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [termId]);

  // 실시간 반영: 학생 제출을 주기적으로(15초) 자동 새로고침.
  // 탭이 백그라운드거나, 방금 관리자가 입력 중이면(4초 내) 건너뛴다.
  useEffect(() => {
    if (!termId) return;
    let cancelled = false;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (Date.now() - lastEditRef.current < 4000) return;
      api
        .get(`/api/admin/sessions?term=${termId}`)
        .then((se) => {
          if (cancelled) return;
          // 새로고침 응답이 도착하는 사이에 관리자가 입력했으면 버린다.
          if (Date.now() - lastEditRef.current < 4000) return;
          setSessions(se);
        })
        .catch(() => {
          /* 자동 새로고침 실패는 조용히 무시 */
        });
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [termId]);

  // 학생이 입력한 학교 성적은 학교 성적 관리 탭에 주기적으로 반영한다.
  useEffect(() => {
    if (!termId || tab !== "schoolExams" || !term?.schoolExamInput) return;
    let cancelled = false;
    const refresh = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      api
        .get(`/api/admin/roster?term=${termId}`)
        .then((roster) => {
          if (!cancelled) setStudents(roster);
        })
        .catch(() => {
          /* 자동 새로고침 실패는 조용히 무시 */
        });
    };
    refresh();
    const id = setInterval(refresh, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tab, termId, term?.schoolExamInput]);

  // 성적 입력 탭에서 고른 반·날짜도 다른 탭과 함께 기억한다.
  const rememberSelection = React.useCallback((subject: string, date: string) => {
    if (subject) ls.set(LS_SUBJECT, subject);
    if (date) ls.set(LS_DATE, date);
  }, []);

  // 입력 중 표시(자동 새로고침 억제용). 키 입력마다 호출돼도 가볍게 ref 만 갱신.
  const markEditing = React.useCallback(() => {
    lastEditRef.current = Date.now();
  }, []);

  // 채점 필드 입력 (낙관적 업데이트 + 서버 반영)
  // useCallback 으로 참조를 고정 → 메모된 행들이 불필요하게 리렌더되지 않음.
  const setAdminFields = React.useCallback(async (
    studentId: string,
    date: string,
    subject: string,
    patch: Record<string, any>
  ) => {
    lastEditRef.current = Date.now();
    setSessions((prev) => {
      const i = prev.findIndex(
        (s) => s.studentId === studentId && s.date === date && s.subject === subject
      );
      if (i >= 0) {
        const n = [...prev];
        n[i] = { ...n[i], ...patch };
        return n;
      }
      return [
        ...prev,
        {
          id: `temp-${studentId}-${date}-${subject}`,
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
          testAuto: false,
          testScale100: true,
          solved: "",
          adminNote: "",
          max: null,
          ...patch,
        } as ClinicSession,
      ];
    });
    try {
      const doc: ClinicSession = await api.patch("/api/admin/sessions", {
        term: termId,
        studentId,
        date,
        subject,
        patch,
      });
      setSessions((prev) => {
        const rest = prev.filter(
          (s) =>
            !(
              s.studentId === doc.studentId &&
              s.date === doc.date &&
              s.subject === doc.subject
            )
        );
        return [...rest, doc];
      });
    } catch (e: any) {
      alert(e.message || "저장에 실패했습니다.");
      api
        .get(`/api/admin/sessions?term=${termId}`)
        .then(setSessions)
        .catch(() => {});
    }
  }, [termId]);

  const setTestMaxFor = async (
    date: string,
    subject: string,
    val: number | null
  ) => {
    const key = `${date}|${subject}`;
    setTestMax((p) => {
      const n = { ...p };
      if (val == null) delete n[key];
      else n[key] = val;
      return n;
    });
    try {
      await api.put("/api/admin/testconfig", { term: termId, subject, date, maxScore: val });
    } catch (e: any) {
      alert(e.message || "저장에 실패했습니다.");
      reloadTestMax();
    }
  };

  const setTestDetailFor = async (date: string, subject: string, str: string) => {
    const key = `${date}|${subject}`;
    setTestDetail((p) => ({ ...p, [key]: str }));
    try {
      await api.put("/api/admin/testconfig", { term: termId, subject, date, detail: str });
    } catch (e: any) {
      alert(e.message || "저장에 실패했습니다.");
      reloadTestMax();
    }
  };

  const setAdditionalMessageFor = async (
    date: string,
    subject: string,
    str: string
  ) => {
    const key = `${date}|${subject}`;
    setAdditionalMessages((p) => ({ ...p, [key]: str }));
    try {
      await api.put("/api/admin/testconfig", {
        term: termId,
        subject,
        date,
        additionalMessage: str,
      });
    } catch (e: any) {
      alert(e.message || "추가 메시지 저장에 실패했습니다.");
      reloadTestMax();
    }
  };

  const deleteSession = async (id: string) => {
    try {
      await api.del(`/api/admin/sessions/${id}`);
      reloadSessions();
    } catch (e: any) {
      alert(e.message || "삭제에 실패했습니다.");
    }
  };

  /** 학부모 계정을 새로 발급했으면 그 자리에서 한 번 알려 준다. (다시 볼 수 없다) */
  const showIssuedParent = (res: any) => {
    if (!res?.parentPassword) return;
    alert(
      `학부모 계정이 발급되었습니다.\n\n` +
        `아이디  ${res.parentUsername}\n` +
        `비밀번호  ${res.parentPassword}\n\n` +
        `비밀번호는 저장되지 않으므로 지금 학부모님께 전달해 주세요.\n` +
        `잊으셨다면 이 화면에서 다시 발급하면 됩니다.`
    );
  };

  const addStudent = async (v: EditStudent) => {
    try {
      showIssuedParent(await api.post("/api/admin/roster", { term: termId, ...v }));
      reloadStudents();
    } catch (e: any) {
      alert(e.message || "추가에 실패했습니다.");
    }
  };
  const updateStudent = async (enrollmentId: string, patch: EditStudent) => {
    try {
      showIssuedParent(await api.patch(`/api/admin/roster/${enrollmentId}`, patch));
      reloadStudents();
    } catch (e: any) {
      alert(e.message || "수정에 실패했습니다.");
    }
  };
  const deleteStudent = async (enrollmentId: string, account?: boolean) => {
    try {
      await api.del(`/api/admin/roster/${enrollmentId}${account ? "?account=1" : ""}`);
      reloadStudents();
    } catch (e: any) {
      alert(e.message || "삭제에 실패했습니다.");
    }
  };

  // 학기 관리
  const createTerm = async (body: any) => {
    try {
      const t: TermInfo = await api.post("/api/admin/terms", body);
      await reloadTerms();
      setTermId(t.id);
    } catch (e: any) {
      alert(e.message || "학기 생성 실패");
    }
  };
  const updateTerm = async (id: string, patch: any) => {
    try {
      await api.patch(`/api/admin/terms/${id}`, patch);
      const ts = await reloadTerms();
      // 활성 전환 시 그 학기로 이동
      if (patch.active) setTermId(id);
      else if (id === termId) {
        // 현재 학기 설정 변경 → 재조회 트리거 위해 동일 id 유지 (terms 갱신으로 subjects/dates 반영)
        void ts;
      }
    } catch (e: any) {
      alert(e.message || "학기 수정 실패");
    }
  };
  const deleteTerm = async (id: string) => {
    try {
      await api.del(`/api/admin/terms/${id}`);
      const ts = await reloadTerms();
      if (id === termId) {
        const active = ts.find((t) => t.active) ?? ts[0];
        setTermId(active?.id ?? "");
      }
    } catch (e: any) {
      alert(e.message || "학기 삭제 실패");
    }
  };

  const NAV: NavItem[] = [
    { k: "board", label: "클리닉 현황", icon: <CalendarDays size={18} /> },
    { k: "quick", label: "테스트·과제", icon: <ClipboardCheck size={18} /> },
    { k: "scores", label: "성적 입력", icon: <PenLine size={18} /> },
    { k: "weekly", label: "주간 안내 문자", icon: <Send size={18} /> },
    { k: "students", label: "학생 관리", icon: <Users size={18} /> },
    { k: "parentNotice", label: "학부모 계정 안내", icon: <KeyRound size={18} /> },
    { k: "schoolExams", label: "학교 성적 관리", icon: <FileText size={18} /> },
    { k: "responses", label: "응답 관리", icon: <Inbox size={18} /> },
    { k: "terms", label: "학기 관리", icon: <CalendarDays size={18} /> },
  ];

  const termBar = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 18,
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: T.sub }}>학기</span>
      <select
        style={{ ...inputBase, width: "auto", minWidth: 180, padding: "8px 12px" }}
        value={termId}
        onChange={(e) => setTermId(e.target.value)}
      >
        {terms.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
            {t.active ? " (진행중)" : ""}
          </option>
        ))}
      </select>
      {term && !term.active && (
        <span
          style={{
            fontSize: 12.5,
            color: T.warn,
            background: T.warnSoft,
            padding: "4px 10px",
            borderRadius: 999,
            fontWeight: 700,
          }}
        >
          지난 학기
        </span>
      )}
    </div>
  );

  return (
    <Shell
      role="admin"
      name="관리자"
      sub={term ? term.name : "더브코 알파 클리닉"}
      nav={NAV}
      tab={tab}
      setTab={setTab}
      onLogout={onLogout}
    >
      {err ? (
        <div style={{ padding: 40, color: T.bad }}>{err}</div>
      ) : terms.length === 0 ? (
        <AdminTerms
          terms={terms}
          onCreate={createTerm}
          onUpdate={updateTerm}
          onDelete={deleteTerm}
        />
      ) : (
        <>
          {tab !== "terms" && termBar}
          {loading && tab !== "terms" ? (
            <div style={{ padding: 40, color: T.muted }}>불러오는 중…</div>
          ) : (
            <>
              {tab === "board" && (
                <AdminBoard
                  key={termId}
                  students={students}
                  sessions={sessions}
                  testMax={testMax}
                  testDetail={testDetail}
                  additionalMessages={additionalMessages}
                  clinicDates={clinicDates}
                  clinicDatesBySubject={term?.clinicDatesBySubject}
                  subjects={subjects}
                  closedSubjects={term?.closedSubjects}
                  onSetAdminFields={setAdminFields}
                  onSetTestMax={setTestMaxFor}
                  onSetTestDetail={setTestDetailFor}
                  onSetAdditionalMessage={setAdditionalMessageFor}
                  onEditing={markEditing}
                />
              )}
              {tab === "quick" && (
                <AdminQuickGrade
                  key={termId}
                  students={students}
                  sessions={sessions}
                  testMax={testMax}
                  clinicDates={clinicDates}
                  clinicDatesBySubject={term?.clinicDatesBySubject}
                  subjects={subjects}
                  closedSubjects={term?.closedSubjects}
                  onSetAdminFields={setAdminFields}
                  onSetTestMax={setTestMaxFor}
                  onEditing={markEditing}
                />
              )}
              {tab === "scores" && term && (
                <AdminScores
                  key={termId}
                  termId={termId}
                  students={students}
                  subjects={subjects}
                  closedSubjects={term?.closedSubjects}
                  clinicDates={clinicDates}
                  clinicDatesBySubject={term?.clinicDatesBySubject}
                  initialSubject={ls.get(LS_SUBJECT) ?? ""}
                  initialDate={ls.get(LS_DATE) ?? ""}
                  onSelection={rememberSelection}
                />
              )}
              {tab === "weekly" && (
                <AdminWeekly
                  key={termId}
                  termId={termId}
                  students={students}
                  sessions={sessions}
                  clinicDates={clinicDates}
                  additionalMessages={additionalMessages}
                />
              )}
              {tab === "students" && term && (
                <AdminStudents
                  key={termId}
                  students={students}
                  subjects={subjects}
                  closedSubjects={term?.closedSubjects}
                  onAddStudent={addStudent}
                  onUpdateStudent={updateStudent}
                  onDeleteStudent={deleteStudent}
                />
              )}
              {tab === "parentNotice" && (
                <AdminParentNotice key={termId} students={students} />
              )}
              {tab === "schoolExams" && term && (
                <AdminSchoolExams
                  key={termId}
                  term={term}
                  students={students}
                  subjects={subjects}
                />
              )}
              {tab === "responses" && (
                <AdminResponses
                  students={students}
                  sessions={sessions}
                  onDeleteSession={deleteSession}
                />
              )}
              {tab === "terms" && (
                <AdminTerms
                  terms={terms}
                  onCreate={createTerm}
                  onUpdate={updateTerm}
                  onDelete={deleteTerm}
                />
              )}
            </>
          )}
        </>
      )}
    </Shell>
  );
}
