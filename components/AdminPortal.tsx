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
  return saved && subjects.includes(saved) ? saved : subjects[0];
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
async function sendBatched(
  msgs: { to: string; text: string }[],
  batchSize: number,
  onProgress?: (done: number, total: number) => void
): Promise<SendSummary> {
  const size = Math.max(1, batchSize);
  let sent = 0;
  let failed = 0;
  const failedList: { to: string; reason: string }[] = [];
  let redirectedTo: string | undefined;
  for (let i = 0; i < msgs.length; i += size) {
    const chunk = msgs.slice(i, i + size);
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
    onProgress?.(Math.min(i + size, msgs.length), msgs.length);
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
  return `[더브코 알파 클리닉]\n${name} 학생 · ${md(dateIso)}\n· 과제(프린트): ${hwLabel(r?.hwDone)}\n· 과제(쎈): ${hwLabel(r?.hwSsen)}\n· 테스트: ${test}`;
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
    num: student.password ?? "",
    valid: phoneOk(student.password ?? ""),
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
      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <LazyInput
            inputMode="decimal"
            value={r?.testScore == null ? "" : String(r.testScore)}
            placeholder="-"
            onType={onEditing}
            onCommit={(v) => {
              const n = toNum(v);
              if (n !== undefined) patch({ testScore: n });
            }}
            style={{ ...inputBase, width: 52, padding: "6px 8px", textAlign: "center" }}
          />
          <span style={{ color: T.muted, fontSize: 13 }}>/</span>
          <LazyInput
            inputMode="decimal"
            title="이 학생 만점 (반과 다를 때만 수정)"
            value={r?.testMaxOverride == null ? String(max) : String(r.testMaxOverride)}
            onType={onEditing}
            onCommit={(v) => {
              const n = toNum(v);
              if (n !== undefined)
                patch({ testMaxOverride: n === null || n === max ? null : n });
            }}
            style={{
              ...inputBase,
              width: 44,
              padding: "6px 6px",
              textAlign: "center",
              color: r?.testMaxOverride != null ? T.primary : T.muted,
              fontWeight: r?.testMaxOverride != null ? 700 : 400,
            }}
          />
        </div>
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
  subjects,
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
  subjects: string[];
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
  const [date, setDate] = useState(() => restoreDate(clinicDates));
  const [subject, setSubject] = useState(() => restoreSubject(subjects));
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
  // 날짜/과목이 바뀌면 발송 체크 초기화
  useEffect(() => {
    setSelected(new Set());
  }, [date, subject]);

  const maxKey = `${date}|${subject}`;
  // 테스트 만점 기본 10 (설정이 있으면 그 값)
  const max = testMax[maxKey] ?? 10;
  const detail = testDetail[maxKey] ?? "";
  const additionalMessage = additionalMessages[maxKey] ?? "";
  const roster = students
    .filter((s) => (showAll || s.status === "재원") && s.subjects.includes(subject))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
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
              onChange={(e) => setDate(e.target.value)}
            >
              {clinicDates.map((d) => (
                <option key={d} value={d}>
                  {md(d)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 120 }}>
            <div style={lbl}>과목</div>
            <select
              style={inputBase}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              {subjects.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 130 }}>
            <div style={lbl}>테스트 만점 개수 (기본 10)</div>
            <LazyInput
              inputMode="decimal"
              style={inputBase}
              value={String(max)}
              placeholder="10"
              onType={onEditing}
              onCommit={(v) => {
                const n = toNum(v);
                if (n !== undefined) onSetTestMax(date, subject, n);
              }}
            />
          </div>
          <div style={{ minWidth: 180, flex: 1 }}>
            <div style={lbl}>테스트 문항 (반 공통)</div>
            <LazyInput
              style={inputBase}
              value={detail}
              placeholder="예: 3,6,9번"
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
                {["학생", "출석", "질문 문제", "프린트", "쎈", "테스트", "해결 문제", "비고", ""].map(
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
                      text="해당 과목 학생이 없습니다"
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
          <div style={{ ...lbl, marginBottom: 5 }}>과제(쎈)</div>
          <HwToggles value={r?.hwSsen} onSet={(v) => patch({ hwSsen: v })} />
        </div>

        <div>
          <div style={{ ...lbl, marginBottom: 5 }}>테스트</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <LazyInput
              inputMode="decimal"
              value={r?.testScore == null ? "" : String(r.testScore)}
              placeholder="-"
              onType={onEditing}
              onCommit={(v) => {
                const n = toNum(v);
                if (n !== undefined) patch({ testScore: n });
              }}
              style={{ ...inputBase, width: 60, padding: "8px", textAlign: "center" }}
            />
            <span style={{ color: T.muted, fontSize: 14 }}>/</span>
            <LazyInput
              inputMode="decimal"
              title="이 학생 만점 (반과 다를 때만 수정)"
              value={r?.testMaxOverride == null ? String(max) : String(r.testMaxOverride)}
              onType={onEditing}
              onCommit={(v) => {
                const n = toNum(v);
                if (n !== undefined)
                  patch({ testMaxOverride: n === null || n === max ? null : n });
              }}
              style={{
                ...inputBase,
                width: 52,
                padding: "8px",
                textAlign: "center",
                color: r?.testMaxOverride != null ? T.primary : T.muted,
                fontWeight: r?.testMaxOverride != null ? 700 : 400,
              }}
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
  subjects,
  onSetAdminFields,
  onSetTestMax,
  onEditing,
}: {
  students: Student[];
  sessions: ClinicSession[];
  testMax: Record<string, number>;
  clinicDates: string[];
  subjects: string[];
  onSetAdminFields: (
    studentId: string,
    date: string,
    subject: string,
    patch: Record<string, any>
  ) => void;
  onSetTestMax: (date: string, subject: string, val: number | null) => void;
  onEditing: () => void;
}) {
  const [date, setDate] = useState(() => restoreDate(clinicDates));
  const [subject, setSubject] = useState(() => restoreSubject(subjects));
  const [showAll, setShowAll] = useState(false);

  // 선택이 바뀌면 저장 (새로고침 후 복원용)
  useEffect(() => {
    if (subject) ls.set(LS_SUBJECT, subject);
  }, [subject]);
  useEffect(() => {
    if (date) ls.set(LS_DATE, date);
  }, [date]);

  const maxKey = `${date}|${subject}`;
  const max = testMax[maxKey] ?? 10;
  const roster = students
    .filter((s) => (showAll || s.status === "재원") && s.subjects.includes(subject))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const rowFor = (stu: Student) =>
    sessions.find(
      (s) => s.studentId === stu.id && s.date === date && s.subject === subject
    );

  return (
    <div style={{ maxWidth: 560 }}>
      <SectionTitle>테스트 · 과제 빠른 입력</SectionTitle>

      <Card style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 110 }}>
            <div style={lbl}>날짜</div>
            <select style={inputBase} value={date} onChange={(e) => setDate(e.target.value)}>
              {clinicDates.map((d) => (
                <option key={d} value={d}>
                  {md(d)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 110 }}>
            <div style={lbl}>과목</div>
            <select style={inputBase} value={subject} onChange={(e) => setSubject(e.target.value)}>
              {subjects.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div style={{ width: 110 }}>
            <div style={lbl}>만점 (기본 10)</div>
            <LazyInput
              inputMode="decimal"
              style={inputBase}
              value={String(max)}
              onCommit={(v) => {
                const n = toNum(v);
                if (n !== undefined) onSetTestMax(date, subject, n);
              }}
            />
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
        </div>
      </Card>

      {roster.length === 0 && (
        <Card style={{ padding: 8 }}>
          <Empty icon={<Users size={28} />} text="해당 과목 학생이 없습니다" />
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
type EditStudent = Partial<Student> & { password?: string };

function StudentForm({
  init,
  subjects,
  onSubmit,
}: {
  init: EditStudent;
  subjects: string[];
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
  const ok = !!f.name && !!f.username && (isEdit || !!f.password);
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
          <Field label="비밀번호">
            <input
              style={inputBase}
              type="text"
              inputMode="numeric"
              value={f.password ?? ""}
              placeholder={isEdit ? "미입력 시 유지" : "부모 번호 등"}
              onChange={(e) => set("password", e.target.value)}
            />
          </Field>
        </div>
      </div>
      <Field label="학년">
        <input
          style={inputBase}
          value={f.grade ?? ""}
          onChange={(e) => set("grade", e.target.value)}
          placeholder="예: 고2"
        />
      </Field>
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

function AdminStudents({
  students,
  subjects,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
}: {
  students: Student[];
  subjects: string[];
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
              {sub}{" "}
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
                {["이름", "아이디", "비밀번호", "학년", "과목", "상태", ""].map(
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
                    {s.password || "—"}
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

function buildWeeklyText(blocks: WeekBlock[]): string {
  const subs = [...new Set(blocks.map((b) => b.subject))].join(", ");
  const header =
    `안녕하세요 더브코 알파 오현민T 조교입니다.\n` +
    `이번 주 ${subs} 퀴즈 점수 및 과제 진행률 안내 드립니다 :)`;
  const additional = blocks
    .map((b) => b.additionalMessage.trim())
    .filter(Boolean)
    .join("\n");
  const body = blocks
    .map((b) => {
      const lines = [`${md(b.dateIso)} ${b.subject}`];
      if (b.hasTest) lines.push(`퀴즈 점수 : ${b.testPct}점`);
      if (b.hwDone != null) lines.push(`과제 (프린트) 진행률 : ${hwPct(b.hwDone)}%`);
      if (b.hwSsen != null) lines.push(`과제 (교재) 진행률 : ${hwPct(b.hwSsen)}%`);
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
}: {
  students: Student[];
  sessions: ClinicSession[];
  clinicDates: string[];
  additionalMessages: Record<string, string>;
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
        num: s.password ?? "",
        valid: phoneOk(s.password ?? ""),
        blocks,
        text: blocks.length ? buildWeeklyText(blocks) : "",
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
        `${msgs.length}명에게 ${testMode ? "(테스트) 내 번호로 " : ""}${batchSize}명씩 나눠 보낼까요?`
      )
    )
      return;
    setSending(true);
    setNote(`발송 중… 0/${msgs.length}`);
    try {
      const res = await sendBatched(msgs, batchSize, (done, total) =>
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
              만들기 (활성화)
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
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {!t.active && (
                <Btn size="sm" variant="soft" onClick={() => onUpdate(t.id, { active: true })}>
                  활성화
                </Btn>
              )}
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

function TermSettingsForm({
  term,
  onSubmit,
}: {
  term: TermInfo;
  onSubmit: (patch: any) => Promise<void>;
}) {
  const [name, setName] = useState(term.name);
  const [subjects, setSubjects] = useState(term.subjects.join(", "));
  const [dates, setDates] = useState<string[]>(term.clinicDates);
  const [newDate, setNewDate] = useState("");

  const addDate = () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(newDate) && !dates.includes(newDate)) {
      setDates([...dates, newDate].sort());
      setNewDate("");
    }
  };

  return (
    <div>
      <Field label="학기 이름">
        <input style={inputBase} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="반 (쉼표로 구분)">
        <textarea
          style={{ ...inputBase, minHeight: 60, resize: "vertical" }}
          value={subjects}
          onChange={(e) => setSubjects(e.target.value)}
          placeholder="예: 고1 공수2, 고2 미적분1"
        />
      </Field>
      <Field label={`클리닉 날짜 (${dates.length}일)`}>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input
            type="date"
            style={{ ...inputBase, flex: 1 }}
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
          />
          <Btn variant="soft" onClick={addDate}>
            <Plus size={15} />추가
          </Btn>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {dates.map((d) => (
            <span
              key={d}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 10px",
                background: T.primarySoft,
                color: T.primary,
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              {md(d)}
              <button
                onClick={() => setDates(dates.filter((x) => x !== d))}
                style={{ border: "none", background: "transparent", cursor: "pointer", color: T.primary, display: "flex", padding: 0 }}
              >
                <Trash2 size={12} />
              </button>
            </span>
          ))}
        </div>
      </Field>
      <Btn
        onClick={() =>
          onSubmit({
            name,
            subjects: subjects.split(",").map((x) => x.trim()).filter(Boolean),
            clinicDates: dates,
          })
        }
        style={{ width: "100%", justifyContent: "center" }}
      >
        <Save size={16} />저장
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
    setLoading(true);
    Promise.all([
      api.get(`/api/admin/roster?term=${termId}`),
      api.get(`/api/admin/sessions?term=${termId}`),
      api.get(`/api/admin/testconfig?term=${termId}`),
    ])
      .then(([st, se, tm]) => {
        setStudents(st);
        setSessions(se);
        setTestMax(tm.max ?? {});
        setTestDetail(tm.detail ?? {});
        setAdditionalMessages(tm.additionalMessage ?? {});
      })
      .catch((e: any) => setErr(e.message || "데이터를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [termId]);

  // 실시간 반영: 학생 제출을 주기적으로(15초) 자동 새로고침.
  // 탭이 백그라운드거나, 방금 관리자가 입력 중이면(4초 내) 건너뛴다.
  useEffect(() => {
    if (!termId) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (Date.now() - lastEditRef.current < 4000) return;
      api
        .get(`/api/admin/sessions?term=${termId}`)
        .then((se) => {
          // 새로고침 응답이 도착하는 사이에 관리자가 입력했으면 버린다.
          if (Date.now() - lastEditRef.current < 4000) return;
          setSessions(se);
        })
        .catch(() => {
          /* 자동 새로고침 실패는 조용히 무시 */
        });
    }, 15000);
    return () => clearInterval(id);
  }, [termId]);

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

  const addStudent = async (v: EditStudent) => {
    try {
      await api.post("/api/admin/roster", { term: termId, ...v });
      reloadStudents();
    } catch (e: any) {
      alert(e.message || "추가에 실패했습니다.");
    }
  };
  const updateStudent = async (enrollmentId: string, patch: EditStudent) => {
    try {
      await api.patch(`/api/admin/roster/${enrollmentId}`, patch);
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
    { k: "weekly", label: "주간 안내 문자", icon: <Send size={18} /> },
    { k: "students", label: "학생 관리", icon: <Users size={18} /> },
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
                  subjects={subjects}
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
                  subjects={subjects}
                  onSetAdminFields={setAdminFields}
                  onSetTestMax={setTestMaxFor}
                  onEditing={markEditing}
                />
              )}
              {tab === "weekly" && (
                <AdminWeekly
                  key={termId}
                  students={students}
                  sessions={sessions}
                  clinicDates={clinicDates}
                  additionalMessages={additionalMessages}
                />
              )}
              {tab === "students" && (
                <AdminStudents
                  students={students}
                  subjects={subjects}
                  onAddStudent={addStudent}
                  onUpdateStudent={updateStudent}
                  onDeleteStudent={deleteStudent}
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
