import React, { useState, useMemo, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import {
  LogOut, User, Shield, ClipboardList, History, TrendingUp, Users, Inbox,
  CheckCircle2, XCircle, Clock, Pencil, Trash2, Plus, Save, ChevronLeft,
  ChevronRight, Search, Eye, X, GraduationCap, CalendarDays, ArrowLeft,
} from "lucide-react";

/* ============================== THEME ============================== */
const T = {
  bg: "#EDF0F5", surface: "#FFFFFF", ink: "#17233B", sub: "#586580",
  line: "#DEE4EE", primary: "#2C4A82", primarySoft: "#E6ECF7", accent: "#DFA02E",
  ok: "#2E9E6B", okSoft: "#E5F4EC", warn: "#CF8A2A", warnSoft: "#FAF0DE",
  bad: "#D2543F", badSoft: "#FBE7E2", muted: "#93A0B4",
};
const FONT =
  "'Pretendard','Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',-apple-system,sans-serif";

/* ============================== DATA ============================== */
const CLINIC_DATES = [
  "2025-03-08", "2025-03-15", "2025-03-21", "2025-03-28", "2025-03-29",
  "2025-04-05", "2025-04-11", "2025-04-12", "2025-04-19", "2025-04-25",
  "2025-05-10", "2025-05-16", "2025-05-23", "2025-05-24", "2025-05-30",
  "2025-05-31", "2025-06-06", "2025-06-13", "2025-06-14", "2025-06-20", "2025-06-21",
];
const SUBJECTS = ["수학"];
const SOURCE_OPTS = ["교재", "쎈", "학교 프린트", "과제문제 재설명(지난 회차)", "개인 교재(수특 등)", "없음"];
const QTYPE_OPTS = [
  "설명을 들었으나 재설명이 필요함", "풀어보았지만 답에 도달하지 못함",
  "접근법이 떠오르지 않아 시도하지 못함", "풀었지만 다른 해법이 있는지 궁금함", "개념이 부족한 것 같음",
];

const md = (iso) => { const [, m, d] = iso.split("-"); return `${+m}/${+d}`; };
const uid = () => Math.random().toString(36).slice(2, 9);

const seedStudents = [
  { id: "s1", name: "김민준", username: "minjun", password: "1234", grade: "고2", subjects: ["수학"], status: "재원" },
  { id: "s2", name: "이서연", username: "seoyeon", password: "1234", grade: "고2", subjects: ["수학"], status: "재원" },
  { id: "s3", name: "박지호", username: "jiho", password: "1234", grade: "고3", subjects: ["수학"], status: "재원" },
  { id: "s4", name: "정하윤", username: "hayoon", password: "1234", grade: "고1", subjects: ["수학"], status: "퇴원" },
];

// testMax keyed by `${date}|${subject}`
const seedTestMax = {
  "2025-03-08|수학": 10, "2025-03-29|수학": 10, "2025-04-05|수학": 10,
  "2025-04-11|수학": 10, "2025-05-16|수학": 10, "2025-05-23|수학": 10,
  "2025-05-30|수학": 10, "2025-05-31|수학": 10, "2025-06-13|수학": 10,
  "2025-06-14|수학": 10, "2025-06-20|수학": 5, "2025-06-07|수학": 10,
};

const S = (o) => ({
  id: uid(), subject: "수학", submitted: true, attendance: "출석",
  lateTime: "", absentReason: "", sources: ["교재"], sourcesEtc: "",
  qNumbers: "", qTypes: [], qTypesEtc: "", request: "",
  hwDone: null, testScore: null, solved: "", adminNote: "", ...o,
});

const seedSessions = [
  // 김민준 (s1)
  S({ studentId: "s1", date: "2025-03-08", hwDone: true, testScore: 9 }),
  S({ studentId: "s1", date: "2025-03-15", sources: ["쎈"], qNumbers: "쎈 20번", qTypes: ["풀어보았지만 답에 도달하지 못함"], solved: "20번", hwDone: true }),
  S({ studentId: "s1", date: "2025-03-21", hwDone: true }),
  S({ studentId: "s1", date: "2025-03-29", hwDone: true, testScore: 10 }),
  S({ studentId: "s1", date: "2025-04-05", sources: ["학교 프린트"], qNumbers: "프린트 5,7번", qTypes: ["개념이 부족한 것 같음"], hwDone: true, testScore: 8 }),
  S({ studentId: "s1", date: "2025-04-11", hwDone: true, testScore: 8 }),
  S({ studentId: "s1", date: "2025-05-10", hwDone: true }),
  S({ studentId: "s1", date: "2025-05-16", hwDone: true, testScore: 2 }),
  S({ studentId: "s1", date: "2025-05-23", hwDone: true, testScore: 7 }),
  S({ studentId: "s1", date: "2025-05-30", hwDone: true, testScore: 5 }),
  S({ studentId: "s1", date: "2025-05-31", testScore: 9, hwDone: false }),
  S({ studentId: "s1", date: "2025-06-13", hwDone: true, testScore: 3 }),
  S({ studentId: "s1", date: "2025-06-14", testScore: 9, hwDone: true }),
  S({ studentId: "s1", date: "2025-06-20", sources: ["개인 교재(수특 등)"], sourcesEtc: "", qNumbers: "올림포스 22, 23, 26", qTypes: ["접근법이 떠오르지 않아 시도하지 못함", "개념이 부족한 것 같음"], request: "유사 문제 추천 부탁드려요", hwDone: true, testScore: 4, solved: "22, 23번" }),
  // 미제출 예시 (폼 미작성)
  { id: uid(), studentId: "s1", date: "2025-04-19", subject: "수학", submitted: false, sources: [], qTypes: [], hwDone: null, testScore: null, solved: "", adminNote: "" },
  { id: uid(), studentId: "s1", date: "2025-06-21", subject: "수학", submitted: false, sources: [], qTypes: [], hwDone: null, testScore: null, solved: "", adminNote: "" },

  // 이서연 (s2)
  S({ studentId: "s2", date: "2025-03-08", attendance: "지각", lateTime: "10분", hwDone: true, testScore: 7 }),
  S({ studentId: "s2", date: "2025-03-29", hwDone: true, testScore: 9 }),
  S({ studentId: "s2", date: "2025-04-05", sources: ["교재", "쎈"], qNumbers: "교재 45번, 쎈 12번", qTypes: ["풀었지만 다른 해법이 있는지 궁금함"], hwDone: true, testScore: 9 }),
  S({ studentId: "s2", date: "2025-04-11", hwDone: false, testScore: 6 }),
  S({ studentId: "s2", date: "2025-05-16", hwDone: true, testScore: 8 }),
  S({ studentId: "s2", date: "2025-05-23", hwDone: true, testScore: 9 }),
  S({ studentId: "s2", date: "2025-05-30", hwDone: true, testScore: 4 }),
  S({ studentId: "s2", date: "2025-06-13", hwDone: true, testScore: 8 }),
  S({ studentId: "s2", date: "2025-06-20", sources: ["없음"], qNumbers: "", qTypes: [], hwDone: true, testScore: 5 }),

  // 박지호 (s3)
  S({ studentId: "s3", date: "2025-03-29", attendance: "결석", absentReason: "몸살", submitted: true, sources: ["없음"], hwDone: false }),
  S({ studentId: "s3", date: "2025-05-16", hwDone: true, testScore: 6 }),
  S({ studentId: "s3", date: "2025-06-13", hwDone: false, testScore: 3 }),
];

/* ============================== UI PRIMITIVES ============================== */
function Btn({ children, onClick, variant = "primary", size = "md", disabled, style = {}, title }) {
  const pad = size === "sm" ? "6px 11px" : size === "xs" ? "4px 9px" : "9px 16px";
  const fs = size === "sm" || size === "xs" ? 13 : 14.5;
  const map = {
    primary: { bg: T.primary, col: "#fff", bd: T.primary },
    accent: { bg: T.accent, col: "#3a2c05", bd: T.accent },
    soft: { bg: T.primarySoft, col: T.primary, bd: T.primarySoft },
    outline: { bg: "#fff", col: T.ink, bd: T.line },
    ghost: { bg: "transparent", col: T.sub, bd: "transparent" },
    danger: { bg: "#fff", col: T.bad, bd: T.badSoft },
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: pad,
        fontSize: fs, fontWeight: 600, fontFamily: FONT, lineHeight: 1.1,
        color: map.col, background: map.bg, border: `1px solid ${map.bd}`,
        borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1, transition: "filter .12s", whiteSpace: "nowrap", ...style,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(0.96)")}
      onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}>
      {children}
    </button>
  );
}
function Card({ children, style }) {
  return <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, ...style }}>{children}</div>;
}
function Pill({ children, tone = "muted" }) {
  const m = {
    ok: [T.okSoft, T.ok], warn: [T.warnSoft, T.warn], bad: [T.badSoft, T.bad],
    primary: [T.primarySoft, T.primary], muted: ["#EEF1F6", T.sub],
  }[tone];
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, background: m[0], color: m[1] }}>{children}</span>;
}
const inputBase = {
  width: "100%", padding: "10px 12px", fontSize: 14.5, fontFamily: FONT,
  color: T.ink, background: "#fff", border: `1px solid ${T.line}`,
  borderRadius: 10, outline: "none", boxSizing: "border-box",
};
function Field({ label, children, hint }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      {label && <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, marginBottom: 6 }}>{label}</div>}
      {hint && <div style={{ fontSize: 12.5, color: T.sub, marginBottom: 8, whiteSpace: "pre-line", lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </label>
  );
}
function Modal({ open, onClose, title, children, width = 560 }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,28,45,.42)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", zIndex: 60, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: width, boxShadow: "0 24px 60px rgba(15,25,50,.28)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>{title}</div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: T.sub, display: "flex" }}><X size={20} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}
function Check({ checked, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 2px", cursor: "pointer", fontSize: 14.5, color: T.ink }}>
      <span style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${checked ? T.primary : T.line}`, background: checked ? T.primary : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {checked && <CheckCircle2 size={13} color="#fff" strokeWidth={3} />}
      </span>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ display: "none" }} />
      {label}
    </label>
  );
}
function Radio({ checked, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 2px", cursor: "pointer", fontSize: 14.5, color: T.ink }}>
      <span style={{ width: 20, height: 20, borderRadius: 999, border: `2px solid ${checked ? T.primary : T.line}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {checked && <span style={{ width: 10, height: 10, borderRadius: 999, background: T.primary }} />}
      </span>
      <input type="radio" checked={checked} onChange={onChange} style={{ display: "none" }} />
      {label}
    </label>
  );
}
function Empty({ icon, text }) {
  return <div style={{ textAlign: "center", padding: "44px 20px", color: T.muted, fontSize: 14 }}>
    <div style={{ marginBottom: 10, display: "flex", justifyContent: "center", opacity: .6 }}>{icon}</div>{text}
  </div>;
}
const attTone = { "출석": "ok", "지각": "warn", "결석": "bad" };

/* ============================== STUDENT: CLINIC FORM ============================== */
function ClinicForm({ initial, onSave, onDelete, onCancel }) {
  const [f, setF] = useState(initial);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const toggleArr = (k, v) => setF((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }));
  const isEdit = !!initial.id && initial._existing;

  return (
    <div>
      <Field label="클리닉 시간 출석 여부 *">
        {["출석", "지각", "결석"].map((a) => (
          <div key={a}>
            <Radio checked={f.attendance === a} onChange={() => set("attendance", a)}
              label={a === "출석" ? "출석 완료" : a === "지각" ? "지각 (시간 기입 요망)" : "결석 (사유 기입 요망)"} />
            {f.attendance === "지각" && a === "지각" && (
              <input style={{ ...inputBase, margin: "2px 0 4px 30px", width: "calc(100% - 30px)" }} placeholder="지각 시간 (예: 10분)" value={f.lateTime} onChange={(e) => set("lateTime", e.target.value)} />
            )}
            {f.attendance === "결석" && a === "결석" && (
              <input style={{ ...inputBase, margin: "2px 0 4px 30px", width: "calc(100% - 30px)" }} placeholder="결석 사유" value={f.absentReason} onChange={(e) => set("absentReason", e.target.value)} />
            )}
          </div>
        ))}
      </Field>

      <Field label="질문할 문제의 출처 *">
        {SOURCE_OPTS.map((o) => <Check key={o} checked={f.sources.includes(o)} onChange={() => toggleArr("sources", o)} label={o} />)}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Check checked={f.sources.includes("기타")} onChange={() => toggleArr("sources", "기타")} label="기타:" />
          <input style={{ ...inputBase, flex: 1 }} value={f.sourcesEtc} onChange={(e) => set("sourcesEtc", e.target.value)} disabled={!f.sources.includes("기타")} placeholder="직접 입력" />
        </div>
      </Field>

      <Field label="질문할 문제 번호"
        hint={"(최대 5개까지 기입 가능, 꼭 comma로 구분해주세요)\n(각 문제 번호 앞에 출처도 같이 적어주세요)\n(질문이 없으면 미기입하시면 됩니다)"}>
        <textarea style={{ ...inputBase, minHeight: 64, resize: "vertical" }} value={f.qNumbers} onChange={(e) => set("qNumbers", e.target.value)} placeholder="예) 쎈 20번, 교재 45번" />
      </Field>

      <Field label="본인이 생각하는 질문할 문제의 유형 (중복 가능)">
        {QTYPE_OPTS.map((o) => <Check key={o} checked={f.qTypes.includes(o)} onChange={() => toggleArr("qTypes", o)} label={o} />)}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Check checked={f.qTypes.includes("기타")} onChange={() => toggleArr("qTypes", "기타")} label="기타:" />
          <input style={{ ...inputBase, flex: 1 }} value={f.qTypesEtc} onChange={(e) => set("qTypesEtc", e.target.value)} disabled={!f.qTypes.includes("기타")} placeholder="직접 입력" />
        </div>
      </Field>

      <Field label="선생님께 특별히 요청하고 싶은 사항 (예: 개념 설명, 유사 문제 추천 등)">
        <textarea style={{ ...inputBase, minHeight: 54, resize: "vertical" }} value={f.request} onChange={(e) => set("request", e.target.value)} />
      </Field>

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <Btn onClick={() => onSave({ ...f, submitted: true })}><Save size={16} />{isEdit ? "수정 저장" : "제출하기"}</Btn>
        {onCancel && <Btn variant="outline" onClick={onCancel}>취소</Btn>}
        {isEdit && <Btn variant="danger" onClick={onDelete} style={{ marginLeft: "auto" }}><Trash2 size={16} />응답 삭제</Btn>}
      </div>
    </div>
  );
}

/* ============================== STUDENT PORTAL ============================== */
function StudentPortal({ me, sessions, testMax, onSave, onDelete }) {
  const [tab, setTab] = useState("input");
  const [subject, setSubject] = useState(me.subjects[0]);
  const [date, setDate] = useState(CLINIC_DATES[CLINIC_DATES.length - 1]);

  const mine = useMemo(() => sessions.filter((s) => s.studentId === me.id), [sessions, me.id]);
  const current = mine.find((s) => s.date === date && s.subject === subject);

  const NAV = [
    { k: "input", label: "클리닉 입력", icon: <ClipboardList size={18} /> },
    { k: "history", label: "내 이력", icon: <History size={18} /> },
    { k: "stats", label: "통계", icon: <TrendingUp size={18} /> },
  ];

  return (
    <Shell
      role="student" name={me.name} sub={`${me.grade} · ${me.subjects.join(", ")}`}
      nav={NAV} tab={tab} setTab={setTab}>
      {tab === "input" && (
        <div style={{ maxWidth: 640 }}>
          <SectionTitle>클리닉 입력</SectionTitle>
          <Card style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: T.sub, marginBottom: 6 }}>과목</div>
                <select style={inputBase} value={subject} onChange={(e) => setSubject(e.target.value)}>
                  {me.subjects.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: T.sub, marginBottom: 6 }}>클리닉 날짜</div>
                <select style={inputBase} value={date} onChange={(e) => setDate(e.target.value)}>
                  {CLINIC_DATES.map((d) => <option key={d} value={d}>{md(d)}</option>)}
                </select>
              </div>
            </div>
          </Card>

          {current?.submitted ? (
            <Card style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, color: T.ok, fontWeight: 700, fontSize: 14 }}>
                <CheckCircle2 size={18} /> {md(date)} 응답이 제출되었습니다. 자유롭게 수정하거나 삭제할 수 있어요.
              </div>
              <ClinicForm initial={{ ...current, _existing: true }}
                onSave={(v) => onSave({ ...v, studentId: me.id, date, subject })}
                onDelete={() => onDelete(current.id)} />
            </Card>
          ) : (
            <Card style={{ padding: 20 }}>
              <ClinicForm
                initial={S({ studentId: me.id, date, subject, sources: [], attendance: "출석" })}
                onSave={(v) => onSave({ ...v, studentId: me.id, date, subject })} />
            </Card>
          )}
        </div>
      )}

      {tab === "history" && <StudentHistory mine={mine} testMax={testMax} subject={subject} setSubject={setSubject} subjects={me.subjects} />}
      {tab === "stats" && <StudentStats mine={mine} testMax={testMax} />}
    </Shell>
  );
}

function StudentHistory({ mine, testMax, subject, setSubject, subjects }) {
  const rows = useMemo(() =>
    [...mine].filter((s) => s.subject === subject).sort((a, b) => a.date.localeCompare(b.date)),
    [mine, subject]);
  return (
    <div>
      <SectionTitle>내 클리닉 이력</SectionTitle>
      <div style={{ marginBottom: 14 }}>
        <Segmented options={subjects} value={subject} onChange={setSubject} />
      </div>
      <Card style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 640 }}>
            <thead>
              <tr style={{ background: "#F6F8FB" }}>
                {["날짜", "질문 문제", "해결 문제", "과제", "테스트"].map((h, i) => (
                  <th key={h} style={{ textAlign: i < 2 ? "left" : "center", padding: "12px 14px", fontSize: 12.5, fontWeight: 800, color: T.sub, borderBottom: `1px solid ${T.line}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5}><Empty icon={<History size={28} />} text="클리닉 기록이 없습니다" /></td></tr>}
              {rows.map((r) => {
                const max = testMax[`${r.date}|${r.subject}`];
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                    <td style={{ padding: "12px 14px", fontWeight: 700, color: T.ink, whiteSpace: "nowrap" }}>{md(r.date)}</td>
                    <td style={{ padding: "12px 14px", color: r.submitted ? T.ink : T.bad, fontWeight: r.submitted ? 400 : 700 }}>
                      {!r.submitted ? "미제출" : (r.qNumbers || <span style={{ color: T.muted }}>—</span>)}
                    </td>
                    <td style={{ padding: "12px 14px", color: T.ink }}>{r.solved || <span style={{ color: T.muted }}>—</span>}</td>
                    <td style={{ padding: "12px 14px", textAlign: "center" }}>
                      {r.hwDone === true ? <CheckCircle2 size={17} color={T.ok} style={{ verticalAlign: "middle" }} />
                        : r.hwDone === false ? <XCircle size={17} color={T.bad} style={{ verticalAlign: "middle" }} />
                          : <span style={{ color: T.muted }}>—</span>}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: 700, color: T.ink }}>
                      {r.testScore != null ? <>{r.testScore}<span style={{ color: T.muted, fontWeight: 400 }}> / {max ?? "?"}</span></> : <span style={{ color: T.muted, fontWeight: 400 }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StudentStats({ mine, testMax }) {
  const done = mine.filter((s) => s.hwDone !== null);
  const hwRate = done.length ? Math.round((done.filter((s) => s.hwDone).length / done.length) * 100) : 0;
  const testRows = mine.filter((s) => s.testScore != null && testMax[`${s.date}|${s.subject}`])
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ date: md(s.date), pct: Math.round((s.testScore / testMax[`${s.date}|${s.subject}`]) * 100), raw: s.testScore, max: testMax[`${s.date}|${s.subject}`] }));
  const avg = testRows.length ? Math.round(testRows.reduce((a, r) => a + r.pct, 0) / testRows.length) : 0;
  const attended = mine.filter((s) => s.submitted && s.attendance === "출석").length;
  const submittedCnt = mine.filter((s) => s.submitted).length;

  const Stat = ({ label, value, unit, tone }) => (
    <Card style={{ padding: 18, flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 13, color: T.sub, fontWeight: 600, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: tone || T.ink, lineHeight: 1 }}>{value}<span style={{ fontSize: 15, fontWeight: 700, color: T.muted, marginLeft: 3 }}>{unit}</span></div>
    </Card>
  );

  return (
    <div>
      <SectionTitle>학습 통계</SectionTitle>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Stat label="과제 완료율" value={hwRate} unit="%" tone={hwRate >= 80 ? T.ok : hwRate >= 50 ? T.warn : T.bad} />
        <Stat label="테스트 평균" value={avg} unit="%" tone={T.primary} />
        <Stat label="제출 횟수" value={submittedCnt} unit="회" />
        <Stat label="출석 완료" value={attended} unit="회" tone={T.ok} />
      </div>

      <Card style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, marginBottom: 14 }}>테스트 점수 추이 (100점 환산)</div>
        {testRows.length === 0 ? <Empty icon={<TrendingUp size={28} />} text="테스트 기록이 아직 없습니다" /> :
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={testRows} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.line} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: T.sub }} tickLine={false} axisLine={{ stroke: T.line }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: T.sub }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${T.line}`, fontSize: 13 }}
                formatter={(v, n, p) => [`${v}% (${p.payload.raw}/${p.payload.max})`, "점수"]} />
              <Line type="monotone" dataKey="pct" stroke={T.primary} strokeWidth={2.5} dot={{ r: 4, fill: T.primary }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>}
      </Card>

      <Card style={{ padding: 18 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, marginBottom: 14 }}>과제 수행 현황</div>
        <div style={{ display: "flex", height: 14, borderRadius: 999, overflow: "hidden", background: T.badSoft, marginBottom: 10 }}>
          <div style={{ width: `${hwRate}%`, background: T.ok }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: T.sub }}>
          <span>완료 {done.filter((s) => s.hwDone).length}회</span>
          <span>미수행 {done.filter((s) => !s.hwDone).length}회</span>
        </div>
      </Card>
    </div>
  );
}

/* ============================== ADMIN PORTAL ============================== */
function AdminPortal({ students, sessions, testMax, onSetAdminFields, onSetTestMax, onDeleteSession,
  onAddStudent, onUpdateStudent, onDeleteStudent }) {
  const [tab, setTab] = useState("board");
  const NAV = [
    { k: "board", label: "클리닉 현황", icon: <CalendarDays size={18} /> },
    { k: "students", label: "학생 관리", icon: <Users size={18} /> },
    { k: "responses", label: "응답 관리", icon: <Inbox size={18} /> },
  ];
  return (
    <Shell role="admin" name="관리자" sub="더브코 알파 클리닉" nav={NAV} tab={tab} setTab={setTab}>
      {tab === "board" && <AdminBoard students={students} sessions={sessions} testMax={testMax} onSetAdminFields={onSetAdminFields} onSetTestMax={onSetTestMax} />}
      {tab === "students" && <AdminStudents students={students} onAddStudent={onAddStudent} onUpdateStudent={onUpdateStudent} onDeleteStudent={onDeleteStudent} />}
      {tab === "responses" && <AdminResponses students={students} sessions={sessions} onDeleteSession={onDeleteSession} />}
    </Shell>
  );
}

function AdminBoard({ students, sessions, testMax, onSetAdminFields, onSetTestMax }) {
  const [date, setDate] = useState(CLINIC_DATES[CLINIC_DATES.length - 1]);
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState(null); // session to view

  const maxKey = `${date}|${subject}`;
  const max = testMax[maxKey] ?? "";
  const roster = students.filter((s) => (showAll || s.status === "재원") && s.subjects.includes(subject));

  const rowFor = (stu) => sessions.find((s) => s.studentId === stu.id && s.date === date && s.subject === subject);

  return (
    <div>
      <SectionTitle>클리닉 현황 · 채점</SectionTitle>
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: 130 }}>
            <div style={lbl}>날짜</div>
            <select style={inputBase} value={date} onChange={(e) => setDate(e.target.value)}>{CLINIC_DATES.map((d) => <option key={d} value={d}>{md(d)}</option>)}</select>
          </div>
          <div style={{ minWidth: 120 }}>
            <div style={lbl}>과목</div>
            <select style={inputBase} value={subject} onChange={(e) => setSubject(e.target.value)}>{SUBJECTS.map((s) => <option key={s}>{s}</option>)}</select>
          </div>
          <div style={{ minWidth: 150 }}>
            <div style={lbl}>테스트 만점 개수</div>
            <input type="number" style={inputBase} value={max} placeholder="예: 10"
              onChange={(e) => onSetTestMax(maxKey, e.target.value === "" ? null : Number(e.target.value))} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, color: T.sub, marginBottom: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> 퇴원생 포함
          </label>
        </div>
      </Card>

      <Card style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 760 }}>
            <thead>
              <tr style={{ background: "#F6F8FB" }}>
                {["학생", "출석", "질문 문제", "과제", "테스트", "해결 문제", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "11px 12px", fontSize: 12.5, fontWeight: 800, color: T.sub, borderBottom: `1px solid ${T.line}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.length === 0 && <tr><td colSpan={7}><Empty icon={<Users size={28} />} text="해당 과목 학생이 없습니다" /></td></tr>}
              {roster.map((stu) => {
                const r = rowFor(stu);
                const patch = (p) => onSetAdminFields(stu.id, date, subject, p);
                return (
                  <tr key={stu.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: 700, color: T.ink }}>{stu.name}</div>
                      <div style={{ fontSize: 12, color: T.muted }}>{stu.grade}{stu.status === "퇴원" && " · 퇴원"}</div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {r?.submitted ? <Pill tone={attTone[r.attendance]}>{r.attendance}{r.attendance === "지각" && r.lateTime ? ` ${r.lateTime}` : ""}</Pill> : <Pill tone="bad">미제출</Pill>}
                    </td>
                    <td style={{ padding: "10px 12px", maxWidth: 180, color: r?.submitted ? T.ink : T.muted }}>
                      {r?.submitted ? (r.qNumbers || <span style={{ color: T.muted }}>질문 없음</span>) : "—"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <MiniToggle active={r?.hwDone === true} tone="ok" onClick={() => patch({ hwDone: r?.hwDone === true ? null : true })} label="O" />
                        <MiniToggle active={r?.hwDone === false} tone="bad" onClick={() => patch({ hwDone: r?.hwDone === false ? null : false })} label="X" />
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <input type="number" value={r?.testScore ?? ""} placeholder="-"
                        onChange={(e) => patch({ testScore: e.target.value === "" ? null : Number(e.target.value) })}
                        style={{ ...inputBase, width: 56, padding: "6px 8px", textAlign: "center" }} />
                      <span style={{ color: T.muted, fontSize: 13, marginLeft: 4 }}>/ {max || "?"}</span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <input value={r?.solved ?? ""} placeholder="해결 문제"
                        onChange={(e) => patch({ solved: e.target.value })}
                        style={{ ...inputBase, width: 120, padding: "6px 8px" }} />
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {r?.submitted && <Btn size="xs" variant="soft" onClick={() => setView(r)}><Eye size={14} />응답</Btn>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!view} onClose={() => setView(null)} title={view ? `${students.find((s) => s.id === view.studentId)?.name} · ${md(view.date)} 응답` : ""}>
        {view && <ResponseDetail r={view} />}
      </Modal>
    </div>
  );
}

function MiniToggle({ active, tone, onClick, label }) {
  const c = tone === "ok" ? T.ok : T.bad;
  return <button onClick={onClick} style={{ width: 30, height: 30, borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: "pointer", border: `1px solid ${active ? c : T.line}`, background: active ? (tone === "ok" ? T.okSoft : T.badSoft) : "#fff", color: active ? c : T.muted, fontFamily: FONT }}>{label}</button>;
}

function ResponseDetail({ r }) {
  const Row = ({ k, v }) => (
    <div style={{ display: "flex", gap: 12, padding: "9px 0", borderBottom: `1px solid ${T.line}`, fontSize: 14 }}>
      <div style={{ width: 130, flexShrink: 0, color: T.sub, fontWeight: 700 }}>{k}</div>
      <div style={{ color: T.ink, whiteSpace: "pre-line" }}>{v || <span style={{ color: T.muted }}>—</span>}</div>
    </div>
  );
  const srcs = [...r.sources.filter((s) => s !== "기타"), r.sources.includes("기타") ? `기타: ${r.sourcesEtc}` : null].filter(Boolean).join(", ");
  const types = [...r.qTypes.filter((s) => s !== "기타"), r.qTypes.includes("기타") ? `기타: ${r.qTypesEtc}` : null].filter(Boolean).join(", ");
  return (
    <div>
      <Row k="출석 여부" v={r.attendance + (r.attendance === "지각" && r.lateTime ? ` (${r.lateTime})` : r.attendance === "결석" && r.absentReason ? ` (${r.absentReason})` : "")} />
      <Row k="질문 출처" v={srcs} />
      <Row k="질문 문제 번호" v={r.qNumbers} />
      <Row k="질문 유형" v={types} />
      <Row k="특별 요청" v={r.request} />
    </div>
  );
}

function AdminStudents({ students, onAddStudent, onUpdateStudent, onDeleteStudent }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // student obj or {} for new
  const list = students.filter((s) => s.name.includes(q) || s.username.includes(q));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <SectionTitle noMargin>학생 관리 <span style={{ fontSize: 14, color: T.muted, fontWeight: 600 }}>({students.filter((s) => s.status === "재원").length}명 재원)</span></SectionTitle>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ position: "relative" }}>
            <Search size={16} color={T.muted} style={{ position: "absolute", left: 11, top: 11 }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름/아이디 검색" style={{ ...inputBase, width: 190, paddingLeft: 34 }} />
          </div>
          <Btn onClick={() => setEditing({ name: "", username: "", password: "", grade: "", subjects: ["수학"], status: "재원" })}><Plus size={16} />학생 추가</Btn>
        </div>
      </div>

      <Card style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 620 }}>
            <thead>
              <tr style={{ background: "#F6F8FB" }}>
                {["이름", "아이디", "비밀번호", "학년", "과목", "상태", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "11px 14px", fontSize: 12.5, fontWeight: 800, color: T.sub, borderBottom: `1px solid ${T.line}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${T.line}`, opacity: s.status === "퇴원" ? 0.6 : 1 }}>
                  <td style={{ padding: "11px 14px", fontWeight: 700, color: T.ink }}>{s.name}</td>
                  <td style={{ padding: "11px 14px", color: T.sub }}>{s.username}</td>
                  <td style={{ padding: "11px 14px", color: T.muted, fontFamily: "monospace" }}>{s.password}</td>
                  <td style={{ padding: "11px 14px", color: T.sub }}>{s.grade}</td>
                  <td style={{ padding: "11px 14px", color: T.sub }}>{s.subjects.join(", ")}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <button onClick={() => onUpdateStudent(s.id, { status: s.status === "재원" ? "퇴원" : "재원" })}
                      style={{ cursor: "pointer", border: "none", background: "transparent", padding: 0 }}>
                      <Pill tone={s.status === "재원" ? "ok" : "muted"}>{s.status}</Pill>
                    </button>
                  </td>
                  <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                    <Btn size="xs" variant="ghost" onClick={() => setEditing(s)}><Pencil size={14} />수정</Btn>
                    <Btn size="xs" variant="danger" onClick={() => window.confirm(`${s.name} 학생을 삭제하시겠습니까?`) && onDeleteStudent(s.id)}><Trash2 size={14} /></Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "학생 정보 수정" : "학생 추가"} width={440}>
        {editing && <StudentForm init={editing} onSubmit={(v) => { editing.id ? onUpdateStudent(editing.id, v) : onAddStudent(v); setEditing(null); }} />}
      </Modal>
    </div>
  );
}

function StudentForm({ init, onSubmit }) {
  const [f, setF] = useState(init);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const ok = f.name && f.username && f.password;
  return (
    <div>
      <Field label="이름"><input style={inputBase} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="아이디"><input style={inputBase} value={f.username} onChange={(e) => set("username", e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="비밀번호"><input style={inputBase} value={f.password} onChange={(e) => set("password", e.target.value)} /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="학년"><input style={inputBase} value={f.grade} onChange={(e) => set("grade", e.target.value)} placeholder="예: 고2" /></Field></div>
        <div style={{ flex: 1 }}><Field label="과목"><input style={inputBase} value={f.subjects.join(", ")} onChange={(e) => set("subjects", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} /></Field></div>
      </div>
      <Btn onClick={() => ok && onSubmit(f)} disabled={!ok} style={{ width: "100%", justifyContent: "center" }}><Save size={16} />저장</Btn>
    </div>
  );
}

function AdminResponses({ students, sessions, onDeleteSession }) {
  const [view, setView] = useState(null);
  const rows = useMemo(() =>
    sessions.filter((s) => s.submitted).sort((a, b) => b.date.localeCompare(a.date)),
    [sessions]);
  const sName = (id) => students.find((s) => s.id === id)?.name ?? "?";
  return (
    <div>
      <SectionTitle>제출 응답 관리 <span style={{ fontSize: 14, color: T.muted, fontWeight: 600 }}>({rows.length}건)</span></SectionTitle>
      <Card style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 640 }}>
            <thead>
              <tr style={{ background: "#F6F8FB" }}>
                {["날짜", "학생", "출석", "질문 문제", "유형", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "11px 14px", fontSize: 12.5, fontWeight: 800, color: T.sub, borderBottom: `1px solid ${T.line}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6}><Empty icon={<Inbox size={28} />} text="제출된 응답이 없습니다" /></td></tr>}
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                  <td style={{ padding: "11px 14px", fontWeight: 700, color: T.ink, whiteSpace: "nowrap" }}>{md(r.date)}</td>
                  <td style={{ padding: "11px 14px", color: T.ink }}>{sName(r.studentId)}</td>
                  <td style={{ padding: "11px 14px" }}><Pill tone={attTone[r.attendance]}>{r.attendance}</Pill></td>
                  <td style={{ padding: "11px 14px", maxWidth: 200, color: T.sub }}>{r.qNumbers || <span style={{ color: T.muted }}>질문 없음</span>}</td>
                  <td style={{ padding: "11px 14px", color: T.muted, fontSize: 13 }}>{r.qTypes.length ? `${r.qTypes.length}개` : "—"}</td>
                  <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                    <Btn size="xs" variant="soft" onClick={() => setView(r)}><Eye size={14} />보기</Btn>
                    <Btn size="xs" variant="danger" onClick={() => window.confirm("이 응답을 삭제하시겠습니까?") && onDeleteSession(r.id)}><Trash2 size={14} /></Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Modal open={!!view} onClose={() => setView(null)} title={view ? `${sName(view.studentId)} · ${md(view.date)} 응답` : ""}>
        {view && <ResponseDetail r={view} />}
      </Modal>
    </div>
  );
}

/* ============================== SHELL / NAV ============================== */
const lbl = { fontSize: 12.5, fontWeight: 700, color: T.sub, marginBottom: 6 };
function SectionTitle({ children, noMargin }) {
  return <h2 style={{ fontSize: 20, fontWeight: 800, color: T.ink, margin: noMargin ? 0 : "0 0 16px" }}>{children}</h2>;
}
function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", background: "#E7ECF3", borderRadius: 10, padding: 3, gap: 3 }}>
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)} style={{
          padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FONT,
          fontSize: 13.5, fontWeight: 700, color: value === o ? T.primary : T.sub,
          background: value === o ? "#fff" : "transparent", boxShadow: value === o ? "0 1px 3px rgba(0,0,0,.08)" : "none",
        }}>{o}</button>
      ))}
    </div>
  );
}

function Shell({ role, name, sub, nav, tab, setTab, children, onLogout }) {
  const ctx = React.useContext(AppCtx);
  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: FONT }}>
      {/* Top bar */}
      <header style={{ background: "#fff", borderBottom: `1px solid ${T.line}`, position: "sticky", top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 18px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: T.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <GraduationCap size={19} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: T.ink, lineHeight: 1.1 }}>더브코 <span style={{ color: T.accent }}>알파 클리닉</span></div>
              <div style={{ fontSize: 11.5, color: T.muted }}>{role === "admin" ? "관리자 콘솔" : "학생 포털"}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ textAlign: "right", display: "none", }} className="who" />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 999, background: role === "admin" ? T.warnSoft : T.primarySoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {role === "admin" ? <Shield size={16} color={T.warn} /> : <User size={16} color={T.primary} />}
              </div>
              <div style={{ lineHeight: 1.15 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{name}</div>
                <div style={{ fontSize: 11.5, color: T.muted }}>{sub}</div>
              </div>
            </div>
            <Btn variant="outline" size="sm" onClick={ctx.logout}><LogOut size={15} />로그아웃</Btn>
          </div>
        </div>
        {/* Tabs */}
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 18px", display: "flex", gap: 4, overflowX: "auto" }}>
          {nav.map((n) => (
            <button key={n.k} onClick={() => setTab(n.k)} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "12px 14px", border: "none", cursor: "pointer",
              background: "transparent", fontFamily: FONT, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap",
              color: tab === n.k ? T.primary : T.sub, borderBottom: `2.5px solid ${tab === n.k ? T.primary : "transparent"}`, marginBottom: -1,
            }}>{n.icon}{n.label}</button>
          ))}
        </div>
      </header>
      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "24px 18px 60px" }}>{children}</main>
    </div>
  );
}

/* ============================== LOGIN ============================== */
function Login({ onLogin, error }) {
  const [mode, setMode] = useState("student");
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const submit = () => onLogin(mode, u, p);
  const quick = (uu, pp) => { setU(uu); setP(pp); onLogin(mode, uu, pp); };
  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg, ${T.primary} 0%, #1d3560 100%)`, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: FONT }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 22, color: "#fff" }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(255,255,255,.14)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <GraduationCap size={28} color="#fff" />
          </div>
          <div style={{ fontSize: 23, fontWeight: 800 }}>더브코 <span style={{ color: T.accent }}>알파 클리닉</span></div>
          <div style={{ fontSize: 13.5, color: "rgba(255,255,255,.7)", marginTop: 4 }}>출결 · 질문 · 학습 관리 시스템</div>
        </div>

        <div style={{ background: "#fff", borderRadius: 18, padding: 24, boxShadow: "0 20px 50px rgba(0,0,0,.25)" }}>
          <div style={{ display: "flex", background: "#EEF1F6", borderRadius: 11, padding: 4, marginBottom: 18 }}>
            {[["student", "학생"], ["admin", "관리자"]].map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)} style={{
                flex: 1, padding: "9px 0", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FONT,
                fontSize: 14, fontWeight: 700, color: mode === k ? T.primary : T.sub,
                background: mode === k ? "#fff" : "transparent", boxShadow: mode === k ? "0 1px 3px rgba(0,0,0,.1)" : "none",
              }}>{l}</button>
            ))}
          </div>
          <input style={{ ...inputBase, marginBottom: 10 }} placeholder="아이디" value={u} onChange={(e) => setU(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          <input style={{ ...inputBase, marginBottom: 6 }} type="password" placeholder="비밀번호" value={p} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          {error && <div style={{ color: T.bad, fontSize: 13, margin: "4px 0 8px", fontWeight: 600 }}>{error}</div>}
          <Btn onClick={submit} style={{ width: "100%", justifyContent: "center", marginTop: 10, padding: "11px 0" }}>로그인</Btn>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.line}` }}>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 8, fontWeight: 600 }}>데모 빠른 로그인</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {mode === "student"
                ? <>
                  <Btn size="sm" variant="soft" onClick={() => quick("minjun", "1234")}>김민준</Btn>
                  <Btn size="sm" variant="soft" onClick={() => quick("seoyeon", "1234")}>이서연</Btn>
                </>
                : <Btn size="sm" variant="soft" onClick={() => quick("admin", "admin")}>관리자 로그인</Btn>}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.5)", marginTop: 16 }}>프로토타입 · 데이터는 브라우저 메모리에만 저장됩니다</div>
      </div>
    </div>
  );
}

/* ============================== ROOT ============================== */
const AppCtx = React.createContext({});

export default function App() {
  const [students, setStudents] = useState(seedStudents);
  const [sessions, setSessions] = useState(seedSessions);
  const [testMax, setTestMax] = useState(seedTestMax);
  const [auth, setAuth] = useState(null); // {role, id?}
  const [error, setError] = useState("");

  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css";
    document.head.appendChild(l);
  }, []);

  const login = (role, u, p) => {
    setError("");
    if (role === "admin") {
      if (u === "admin" && p === "admin") setAuth({ role: "admin" });
      else setError("관리자 정보가 일치하지 않습니다.");
    } else {
      const s = students.find((x) => x.username === u && x.password === p);
      if (!s) setError("아이디 또는 비밀번호가 올바르지 않습니다.");
      else if (s.status === "퇴원") setError("퇴원 처리된 계정입니다. 관리자에게 문의하세요.");
      else setAuth({ role: "student", id: s.id });
    }
  };
  const logout = () => { setAuth(null); setError(""); };

  // student data ops
  const saveSession = (data) => setSessions((prev) => {
    const i = prev.findIndex((s) => s.studentId === data.studentId && s.date === data.date && s.subject === data.subject);
    if (i >= 0) { const n = [...prev]; n[i] = { ...n[i], ...data }; return n; }
    return [...prev, S(data)];
  });
  const deleteSession = (id) => setSessions((prev) => prev.filter((s) => s.id !== id));

  // admin ops
  const setAdminFields = (studentId, date, subject, patch) => setSessions((prev) => {
    const i = prev.findIndex((s) => s.studentId === studentId && s.date === date && s.subject === subject);
    if (i >= 0) { const n = [...prev]; n[i] = { ...n[i], ...patch }; return n; }
    return [...prev, { id: uid(), studentId, date, subject, submitted: false, attendance: "출석", lateTime: "", absentReason: "", sources: [], sourcesEtc: "", qNumbers: "", qTypes: [], qTypesEtc: "", request: "", hwDone: null, testScore: null, solved: "", adminNote: "", ...patch }];
  });
  const setTestMaxKey = (key, val) => setTestMax((p) => { const n = { ...p }; if (val == null) delete n[key]; else n[key] = val; return n; });
  const addStudent = (v) => setStudents((p) => [...p, { ...v, id: uid() }]);
  const updateStudent = (id, patch) => setStudents((p) => p.map((s) => s.id === id ? { ...s, ...patch } : s));
  const deleteStudent = (id) => setStudents((p) => p.filter((s) => s.id !== id));

  const me = auth?.role === "student" ? students.find((s) => s.id === auth.id) : null;

  return (
    <AppCtx.Provider value={{ logout }}>
      {!auth && <Login onLogin={login} error={error} />}
      {auth?.role === "student" && me && (
        <StudentPortal me={me} sessions={sessions} testMax={testMax} onSave={saveSession} onDelete={deleteSession} />
      )}
      {auth?.role === "admin" && (
        <AdminPortal students={students} sessions={sessions} testMax={testMax}
          onSetAdminFields={setAdminFields} onSetTestMax={setTestMaxKey} onDeleteSession={deleteSession}
          onAddStudent={addStudent} onUpdateStudent={updateStudent} onDeleteStudent={deleteStudent} />
      )}
    </AppCtx.Provider>
  );
}
