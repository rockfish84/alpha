"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  md,
  attTone,
  pickDefaultDate,
  type Student,
  type ClinicSession,
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
      <div style={{ width: 130, flexShrink: 0, color: T.sub, fontWeight: 700 }}>
        {k}
      </div>
      <div style={{ color: T.ink, whiteSpace: "pre-line" }}>
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
  onSetTestMax: (
    date: string,
    subject: string,
    val: number | null
  ) => void;
}) {
  const [date, setDate] = useState(pickDefaultDate(clinicDates));
  const [subject, setSubject] = useState(subjects[0]);
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState<ClinicSession | null>(null);

  const maxKey = `${date}|${subject}`;
  // 테스트 만점 기본 10 (설정이 있으면 그 값)
  const max = testMax[maxKey] ?? 10;
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
          <div style={{ minWidth: 150 }}>
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
              minWidth: 1080,
            }}
          >
            <thead>
              <tr style={{ background: "#F6F8FB" }}>
                {["학생", "출석", "질문 문제", "과제", "테스트", "테스트 문항", "해결 문제", "비고", ""].map(
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
                  <td colSpan={9}>
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
                      {r?.submitted ? (
                        <Pill tone={attTone[r.attendance]}>
                          {r.attendance}
                          {r.attendance === "지각" && r.lateTime
                            ? ` ${r.lateTime}`
                            : ""}
                        </Pill>
                      ) : (
                        <Pill tone="bad">미제출</Pill>
                      )}
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
                          width: 56,
                          padding: "6px 8px",
                          textAlign: "center",
                        }}
                      />
                      <span
                        style={{ color: T.muted, fontSize: 13, marginLeft: 4 }}
                      >
                        / {max}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <input
                        value={r?.testDetail ?? ""}
                        placeholder="예: 3,6,9번"
                        onChange={(e) => patch({ testDetail: e.target.value })}
                        style={{ ...inputBase, width: 120, padding: "6px 8px" }}
                      />
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
  const [date, setDate] = useState(pickDefaultDate(clinicDates));
  const [subject, setSubject] = useState(subjects[0]);
  const [showAll, setShowAll] = useState(false);

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
                <div style={{ display: "flex", alignItems: "center" }}>
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
                      width: 64,
                      padding: "8px",
                      textAlign: "center",
                    }}
                  />
                  <span style={{ color: T.muted, fontSize: 14, marginLeft: 6 }}>/ {max}</span>
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
  const isEdit = !!init.id;
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
                        onUpdateStudent(s.id, {
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
                        window.confirm(`${s.name} 학생을 삭제하시겠습니까?`) &&
                        onDeleteStudent(s.id)
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
        title={editing?.id ? "학생 정보 수정" : "학생 추가"}
        width={440}
      >
        {editing && (
          <StudentForm
            init={editing}
            onSubmit={(v) => {
              if (editing.id) onUpdateStudent(editing.id, v);
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
export function AdminPortal({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState("board");
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<ClinicSession[]>([]);
  const [testMax, setTestMax] = useState<Record<string, number>>({});
  const [subjects, setSubjects] = useState<string[]>(["수학"]);
  const [clinicDates, setClinicDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const reloadStudents = async () =>
    setStudents(await api.get("/api/admin/students"));
  const reloadSessions = async () =>
    setSessions(await api.get("/api/admin/sessions"));
  const reloadTestMax = async () =>
    setTestMax(await api.get("/api/admin/testconfig"));

  useEffect(() => {
    (async () => {
      try {
        const [st, se, tm, cfg] = await Promise.all([
          api.get("/api/admin/students"),
          api.get("/api/admin/sessions"),
          api.get("/api/admin/testconfig"),
          api.get("/api/config"),
        ]);
        setStudents(st);
        setSessions(se);
        setTestMax(tm);
        setSubjects(cfg.subjects?.length ? cfg.subjects : ["수학"]);
        setClinicDates(cfg.clinicDates ?? []);
      } catch (e: any) {
        setErr(e.message || "데이터를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 채점 필드 입력 (낙관적 업데이트 + 서버 반영)
  const setAdminFields = async (
    studentId: string,
    date: string,
    subject: string,
    patch: Record<string, any>
  ) => {
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
      await api.put("/api/admin/testconfig", { subject, date, maxScore: val });
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
      await api.post("/api/admin/students", v);
      reloadStudents();
    } catch (e: any) {
      alert(e.message || "추가에 실패했습니다.");
    }
  };
  const updateStudent = async (id: string, patch: EditStudent) => {
    try {
      await api.patch(`/api/admin/students/${id}`, patch);
      reloadStudents();
    } catch (e: any) {
      alert(e.message || "수정에 실패했습니다.");
    }
  };
  const deleteStudent = async (id: string) => {
    try {
      await api.del(`/api/admin/students/${id}`);
      reloadStudents();
    } catch (e: any) {
      alert(e.message || "삭제에 실패했습니다.");
    }
  };

  const NAV: NavItem[] = [
    { k: "board", label: "클리닉 현황", icon: <CalendarDays size={18} /> },
    { k: "quick", label: "테스트·과제", icon: <ClipboardCheck size={18} /> },
    { k: "students", label: "학생 관리", icon: <Users size={18} /> },
    { k: "responses", label: "응답 관리", icon: <Inbox size={18} /> },
  ];

  return (
    <Shell
      role="admin"
      name="관리자"
      sub="더브코 알파 클리닉"
      nav={NAV}
      tab={tab}
      setTab={setTab}
      onLogout={onLogout}
    >
      {loading ? (
        <div style={{ padding: 40, color: T.muted }}>불러오는 중…</div>
      ) : err ? (
        <div style={{ padding: 40, color: T.bad }}>{err}</div>
      ) : (
        <>
          {tab === "board" && (
            <AdminBoard
              students={students}
              sessions={sessions}
              testMax={testMax}
              clinicDates={clinicDates}
              subjects={subjects}
              onSetAdminFields={setAdminFields}
              onSetTestMax={setTestMaxFor}
            />
          )}
          {tab === "quick" && (
            <AdminQuickGrade
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
        </>
      )}
    </Shell>
  );
}
