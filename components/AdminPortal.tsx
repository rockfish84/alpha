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

/* ============================== BOARD ============================== */
function AdminBoard({
  students,
  sessions,
  testMax,
  testDetail,
  clinicDates,
  subjects,
  onSetAdminFields,
  onSetTestMax,
  onSetTestDetail,
}: {
  students: Student[];
  sessions: ClinicSession[];
  testMax: Record<string, number>;
  testDetail: Record<string, string>;
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
}) {
  const [date, setDate] = useState(() => restoreDate(clinicDates));
  const [subject, setSubject] = useState(() => restoreSubject(subjects));
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState<ClinicSession | null>(null);

  // 선택이 바뀌면 저장 (새로고침 후 복원용)
  useEffect(() => {
    if (subject) ls.set(LS_SUBJECT, subject);
  }, [subject]);
  useEffect(() => {
    if (date) ls.set(LS_DATE, date);
  }, [date]);

  const maxKey = `${date}|${subject}`;
  // 테스트 만점 기본 10 (설정이 있으면 그 값)
  const max = testMax[maxKey] ?? 10;
  const detail = testDetail[maxKey] ?? "";
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
            <input
              type="number"
              style={inputBase}
              value={max}
              placeholder="10"
              onChange={(e) =>
                onSetTestMax(
                  date,
                  subject,
                  e.target.value === "" ? null : Number(e.target.value)
                )
              }
            />
          </div>
          <div style={{ minWidth: 180, flex: 1 }}>
            <div style={lbl}>테스트 문항 (반 공통)</div>
            <input
              style={inputBase}
              value={detail}
              placeholder="예: 3,6,9번"
              onChange={(e) => onSetTestDetail(date, subject, e.target.value)}
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
      </Card>

      <Card style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
              minWidth: 960,
            }}
          >
            <thead>
              <tr style={{ background: "#F6F8FB" }}>
                {["학생", "출석", "질문 문제", "과제", "테스트", "해결 문제", "비고", ""].map(
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
              </tr>
            </thead>
            <tbody>
              {roster.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <Empty
                      icon={<Users size={28} />}
                      text="해당 과목 학생이 없습니다"
                    />
                  </td>
                </tr>
              )}
              {roster.map((stu) => {
                const r = rowFor(stu);
                const patch = (p: Record<string, any>) =>
                  onSetAdminFields(stu.id, date, subject, p);
                return (
                  <tr
                    key={stu.id}
                    style={{ borderBottom: `1px solid ${T.line}` }}
                  >
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: 700, color: T.ink }}>
                        {stu.name}
                      </div>
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
                      <div style={{ display: "flex", gap: 4 }}>
                        <MiniToggle
                          active={r?.hwDone === 1}
                          tone="ok"
                          onClick={() =>
                            patch({ hwDone: r?.hwDone === 1 ? null : 1 })
                          }
                          label="O"
                        />
                        <MiniToggle
                          active={r?.hwDone === 0.5}
                          tone="warn"
                          onClick={() =>
                            patch({ hwDone: r?.hwDone === 0.5 ? null : 0.5 })
                          }
                          label="△"
                        />
                        <MiniToggle
                          active={r?.hwDone === 0}
                          tone="bad"
                          onClick={() =>
                            patch({ hwDone: r?.hwDone === 0 ? null : 0 })
                          }
                          label="X"
                        />
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input
                          type="number"
                          value={r?.testScore ?? ""}
                          placeholder="-"
                          onChange={(e) =>
                            patch({
                              testScore:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                          style={{
                            ...inputBase,
                            width: 52,
                            padding: "6px 8px",
                            textAlign: "center",
                          }}
                        />
                        <span style={{ color: T.muted, fontSize: 13 }}>/</span>
                        <input
                          type="number"
                          title="이 학생 만점 (반과 다를 때만 수정)"
                          value={r?.testMaxOverride ?? max}
                          onChange={(e) =>
                            patch({
                              testMaxOverride:
                                e.target.value === "" ||
                                Number(e.target.value) === max
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
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
                      <input
                        value={r?.solved ?? ""}
                        placeholder="해결 문제"
                        onChange={(e) => patch({ solved: e.target.value })}
                        style={{ ...inputBase, width: 120, padding: "6px 8px" }}
                      />
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <input
                        value={r?.adminNote ?? ""}
                        placeholder="특이사항"
                        onChange={(e) => patch({ adminNote: e.target.value })}
                        style={{ ...inputBase, width: 140, padding: "6px 8px" }}
                      />
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {r?.submitted && (
                        <Btn
                          size="xs"
                          variant="soft"
                          onClick={() => setView(r)}
                        >
                          <Eye size={14} />
                          응답
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
    </div>
  );
}

/* ============================== QUICK GRADE (모바일용) ============================== */
function AdminQuickGrade({
  students,
  sessions,
  testMax,
  clinicDates,
  subjects,
  onSetAdminFields,
  onSetTestMax,
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
            <input
              type="number"
              style={inputBase}
              value={max}
              onChange={(e) =>
                onSetTestMax(date, subject, e.target.value === "" ? null : Number(e.target.value))
              }
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

      {roster.map((stu) => {
        const r = rowFor(stu);
        const patch = (p: Record<string, any>) => onSetAdminFields(stu.id, date, subject, p);
        return (
          <Card key={stu.id} style={{ padding: 14, marginBottom: 8 }}>
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
                <div style={{ ...lbl, marginBottom: 5 }}>과제</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <MiniToggle
                    active={r?.hwDone === 1}
                    tone="ok"
                    onClick={() => patch({ hwDone: r?.hwDone === 1 ? null : 1 })}
                    label="O"
                  />
                  <MiniToggle
                    active={r?.hwDone === 0.5}
                    tone="warn"
                    onClick={() => patch({ hwDone: r?.hwDone === 0.5 ? null : 0.5 })}
                    label="△"
                  />
                  <MiniToggle
                    active={r?.hwDone === 0}
                    tone="bad"
                    onClick={() => patch({ hwDone: r?.hwDone === 0 ? null : 0 })}
                    label="X"
                  />
                </div>
              </div>

              <div>
                <div style={{ ...lbl, marginBottom: 5 }}>테스트</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={r?.testScore ?? ""}
                    placeholder="-"
                    onChange={(e) =>
                      patch({
                        testScore: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    style={{
                      ...inputBase,
                      width: 60,
                      padding: "8px",
                      textAlign: "center",
                    }}
                  />
                  <span style={{ color: T.muted, fontSize: 14 }}>/</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    title="이 학생 만점 (반과 다를 때만 수정)"
                    value={r?.testMaxOverride ?? max}
                    onChange={(e) =>
                      patch({
                        testMaxOverride:
                          e.target.value === "" || Number(e.target.value) === max
                            ? null
                            : Number(e.target.value),
                      })
                    }
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
      })}
    </div>
  );
}

/* ============================== STUDENTS ============================== */
type EditStudent = Partial<Student> & { password?: string };

function StudentForm({
  init,
  onSubmit,
}: {
  init: EditStudent;
  onSubmit: (v: EditStudent) => void;
}) {
  const [f, setF] = useState<EditStudent>({ ...init, password: init.password ?? "" });
  const isEdit = !!init.enrollmentId;
  const set = (k: keyof EditStudent, v: any) =>
    setF((p) => ({ ...p, [k]: v }));
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
              value={f.password ?? ""}
              placeholder={isEdit ? "미입력 시 유지" : "부모 번호 등"}
              onChange={(e) => set("password", e.target.value)}
            />
          </Field>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
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
        <div style={{ flex: 1 }}>
          <Field label="과목">
            <input
              style={inputBase}
              value={(f.subjects ?? []).join(", ")}
              onChange={(e) =>
                set(
                  "subjects",
                  e.target.value
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean)
                )
              }
            />
          </Field>
        </div>
      </div>
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
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
}: {
  students: Student[];
  onAddStudent: (v: EditStudent) => void;
  onUpdateStudent: (id: string, patch: EditStudent) => void;
  onDeleteStudent: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "subject">("name");
  const [editing, setEditing] = useState<EditStudent | null>(null);
  const list = students
    .filter((s) => s.name.includes(q) || s.username.includes(q))
    .sort((a, b) => {
      // 퇴원은 정렬과 무관하게 항상 맨 아래.
      if (a.status !== b.status) return a.status === "재원" ? -1 : 1;
      if (sortBy === "subject") {
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
                subjects: ["수학"],
                status: "재원",
              })
            }
          >
            <Plus size={16} />
            학생 추가
          </Btn>
        </div>
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

  // 채점 필드 입력 (낙관적 업데이트 + 서버 반영)
  const setAdminFields = async (
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
      reloadSessions();
    }
  };

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
                  clinicDates={clinicDates}
                  subjects={subjects}
                  onSetAdminFields={setAdminFields}
                  onSetTestMax={setTestMaxFor}
                  onSetTestDetail={setTestDetailFor}
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
                />
              )}
              {tab === "students" && (
                <AdminStudents
                  students={students}
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
