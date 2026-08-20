"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ClipboardList,
  History,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Save,
  Trash2,
  FileText,
  Plus,
} from "lucide-react";
import {
  T,
  md,
  SOURCE_OPTS,
  QTYPE_OPTS,
  blankSession,
  pickDefaultDate,
  type ClinicSession,
  type Me,
} from "@/lib/constants";
import { api } from "@/lib/api";
import { getClinicDatesForSubject } from "@/lib/clinic-dates";
import { openSubjects } from "@/lib/subject-status";
import {
  SCHOOL_EXAM_SUBJECTS,
  SCHOOL_EXAM_GRADE_MAX_LENGTH,
  SCHOOL_EXAM_MAX_COUNT,
  SCHOOL_EXAM_NAME_MAX_LENGTH,
  type SchoolExamResult,
} from "@/lib/school-exams";
import {
  Btn,
  Card,
  Field,
  Empty,
  Segmented,
  SectionTitle,
  Check,
  Radio,
  inputBase,
  Toast,
  LazyInput,
} from "./ui";
import { Shell, type NavItem } from "./Shell";

type FormState = ClinicSession & { _existing?: boolean };

/* ============================== CLINIC FORM ============================== */
function ClinicForm({
  initial,
  onSave,
  onDelete,
  onCancel,
}: {
  initial: FormState;
  onSave: (v: ClinicSession) => void;
  onDelete?: () => void;
  onCancel?: () => void;
}) {
  const [f, setF] = useState<FormState>(initial);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const toggleArr = (k: "sources" | "qTypes", v: string) =>
    setF((p) => ({
      ...p,
      [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v],
    }));
  const isEdit = !!initial._existing;

  return (
    <div>
      <Field label="클리닉 시간 출석 여부 *">
        {(["출석", "지각", "결석"] as const).map((a) => (
          <div key={a}>
            <Radio
              checked={f.attendance === a}
              onChange={() => set("attendance", a)}
              label={
                a === "출석"
                  ? "출석 완료"
                  : a === "지각"
                  ? "지각 (시간 기입 요망)"
                  : "결석 (사유 기입 요망)"
              }
            />
            {f.attendance === "지각" && a === "지각" && (
              <LazyInput
                style={{
                  ...inputBase,
                  margin: "2px 0 4px 30px",
                  width: "calc(100% - 30px)",
                }}
                placeholder="지각 시간 (예: 10분)"
                value={f.lateTime}
                onCommit={(v) => set("lateTime", v)}
              />
            )}
            {f.attendance === "결석" && a === "결석" && (
              <LazyInput
                style={{
                  ...inputBase,
                  margin: "2px 0 4px 30px",
                  width: "calc(100% - 30px)",
                }}
                placeholder="결석 사유"
                value={f.absentReason}
                onCommit={(v) => set("absentReason", v)}
              />
            )}
          </div>
        ))}
      </Field>

      <Field label="질문할 문제의 출처 *">
        {SOURCE_OPTS.map((o) => (
          <Check
            key={o}
            checked={f.sources.includes(o)}
            onChange={() => toggleArr("sources", o)}
            label={o}
          />
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Check
            checked={f.sources.includes("기타")}
            onChange={() => toggleArr("sources", "기타")}
            label="기타:"
          />
          <LazyInput
            style={{ ...inputBase, flex: 1 }}
            value={f.sourcesEtc}
            onCommit={(v) => set("sourcesEtc", v)}
            disabled={!f.sources.includes("기타")}
            placeholder="직접 입력"
          />
        </div>
      </Field>

      <Field
        label="질문할 문제 번호"
        hint={
          "(최대 5개까지 기입 가능, 꼭 comma로 구분해주세요)\n(각 문제 번호 앞에 출처도 같이 적어주세요)\n(질문이 없으면 미기입하시면 됩니다)"
        }
      >
        <LazyInput
          multiline
          style={{ ...inputBase, minHeight: 64, resize: "vertical" }}
          value={f.qNumbers}
          onCommit={(v) => set("qNumbers", v)}
          placeholder="예) 쎈 20번, 교재 45번"
        />
      </Field>

      <Field label="본인이 생각하는 질문할 문제의 유형 (중복 가능)">
        {QTYPE_OPTS.map((o) => (
          <Check
            key={o}
            checked={f.qTypes.includes(o)}
            onChange={() => toggleArr("qTypes", o)}
            label={o}
          />
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Check
            checked={f.qTypes.includes("기타")}
            onChange={() => toggleArr("qTypes", "기타")}
            label="기타:"
          />
          <LazyInput
            style={{ ...inputBase, flex: 1 }}
            value={f.qTypesEtc}
            onCommit={(v) => set("qTypesEtc", v)}
            disabled={!f.qTypes.includes("기타")}
            placeholder="직접 입력"
          />
        </div>
      </Field>

      <Field label="선생님께 특별히 요청하고 싶은 사항 (예: 개념 설명, 유사 문제 추천 등)">
        <LazyInput
          multiline
          style={{ ...inputBase, minHeight: 54, resize: "vertical" }}
          value={f.request}
          onCommit={(v) => set("request", v)}
        />
      </Field>

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <Btn onClick={() => onSave({ ...f, submitted: true })}>
          <Save size={16} />
          {isEdit ? "수정 저장" : "제출하기"}
        </Btn>
        {onCancel && (
          <Btn variant="outline" onClick={onCancel}>
            취소
          </Btn>
        )}
        {isEdit && onDelete && (
          <Btn variant="danger" onClick={onDelete} style={{ marginLeft: "auto" }}>
            <Trash2 size={16} />
            응답 삭제
          </Btn>
        )}
      </div>
    </div>
  );
}

/* 과제 O/△/X 아이콘 */
function HwIcon({ v }: { v: number | null }) {
  return v === 1 ? (
    <CheckCircle2 size={17} color={T.ok} style={{ verticalAlign: "middle" }} />
  ) : v === 0.5 ? (
    <span style={{ color: T.warn, fontWeight: 800, fontSize: 16 }}>△</span>
  ) : v === 0 ? (
    <XCircle size={17} color={T.bad} style={{ verticalAlign: "middle" }} />
  ) : (
    <span style={{ color: T.muted }}>—</span>
  );
}

/* ============================== HISTORY ============================== */
function StudentHistory({
  mine,
  subject,
  setSubject,
  subjects,
}: {
  mine: ClinicSession[];
  subject: string;
  setSubject: (s: string) => void;
  subjects: string[];
}) {
  const rows = useMemo(
    () =>
      [...mine]
        .filter((s) => s.subject === subject)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [mine, subject]
  );
  return (
    <div>
      <SectionTitle>내 클리닉 이력</SectionTitle>
      <div style={{ marginBottom: 14 }}>
        <Segmented options={subjects} value={subject} onChange={setSubject} />
      </div>
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
                {["날짜", "질문 문제", "해결 문제", "프린트", "쎈", "테스트"].map(
                  (h, i) => (
                    <th
                      key={h}
                      style={{
                        textAlign: i < 2 ? "left" : "center",
                        padding: "12px 14px",
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
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <Empty
                      icon={<History size={28} />}
                      text="클리닉 기록이 없습니다"
                    />
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                  <td
                    style={{
                      padding: "12px 14px",
                      fontWeight: 700,
                      color: T.ink,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {md(r.date)}
                  </td>
                  <td
                    style={{
                      padding: "12px 14px",
                      color: r.submitted ? T.ink : T.bad,
                      fontWeight: r.submitted ? 400 : 700,
                      maxWidth: 280,
                      whiteSpace: "normal",
                      wordBreak: "break-word",
                    }}
                  >
                    {!r.submitted ? (
                      "미제출"
                    ) : r.qNumbers ? (
                      r.qNumbers
                    ) : (
                      <span style={{ color: T.muted }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 14px", color: T.ink }}>
                    {r.solved || <span style={{ color: T.muted }}>—</span>}
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "center" }}>
                    <HwIcon v={r.hwDone} />
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "center" }}>
                    <HwIcon v={r.hwSsen} />
                  </td>
                  <td
                    style={{
                      padding: "12px 14px",
                      textAlign: "center",
                      fontWeight: 700,
                      color: T.ink,
                    }}
                  >
                    {r.testScore != null ? (
                      <>
                        {r.testScore}
                        <span style={{ color: T.muted, fontWeight: 400 }}>
                          {" "}
                          / {r.max ?? "?"}
                        </span>
                      </>
                    ) : (
                      <span style={{ color: T.muted, fontWeight: 400 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ============================== STATS ============================== */
function StudentStats({
  mine,
  subject,
  setSubject,
  subjects,
}: {
  mine: ClinicSession[];
  subject: string;
  setSubject: (s: string) => void;
  subjects: string[];
}) {
  // 과목별 통계 (다른 과목이 섞이지 않도록 선택 과목만 집계)
  const stats = useMemo(() => {
    const rows = mine.filter((x) => x.subject === subject);
    // 과제는 프린트+쎈 둘 다 합산
    const hwVals = rows
      .flatMap((x) => [x.hwDone, x.hwSsen])
      .filter((v): v is number => v != null);
    const hwSum = hwVals.reduce((a, v) => a + v, 0);
    const testRows = rows
      .filter((x) => x.testScore != null)
      // 날짜 오름차순 → 나중에 본 시험이 뒤에 오도록
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((x) => {
        const max = x.max ?? 10;
        return {
          date: md(x.date),
          pct: Math.round((Number(x.testScore) / max) * 100),
          raw: Number(x.testScore),
          max,
        };
      });
    return {
      hwRate: hwVals.length ? Math.round((hwSum / hwVals.length) * 100) : 0,
      hwFullCnt: hwVals.filter((v) => v === 1).length,
      hwHalfCnt: hwVals.filter((v) => v === 0.5).length,
      hwMissCnt: hwVals.filter((v) => v === 0).length,
      testRows,
      testAvg: testRows.length
        ? Math.round(testRows.reduce((a, r) => a + r.pct, 0) / testRows.length)
        : 0,
      submittedCnt: rows.filter((x) => x.submitted).length,
      attendedCnt: rows.filter(
        (x) => (x.submitted || x.attnAdmin) && x.attendance === "출석"
      ).length,
    };
  }, [mine, subject]);

  const Stat = ({
    label,
    value,
    unit,
    tone,
  }: {
    label: string;
    value: number;
    unit: string;
    tone?: string;
  }) => (
    <Card style={{ padding: 18, flex: 1, minWidth: 150 }}>
      <div
        style={{
          fontSize: 13,
          color: T.sub,
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 30,
          fontWeight: 800,
          color: tone || T.ink,
          lineHeight: 1,
        }}
      >
        {value}
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: T.muted,
            marginLeft: 3,
          }}
        >
          {unit}
        </span>
      </div>
    </Card>
  );

  return (
    <div>
      <SectionTitle>학습 통계</SectionTitle>
      <div style={{ marginBottom: 14 }}>
        <Segmented options={subjects} value={subject} onChange={setSubject} />
      </div>
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <Stat
          label="과제 완료율"
          value={stats.hwRate}
          unit="%"
          tone={
            stats.hwRate >= 80 ? T.ok : stats.hwRate >= 50 ? T.warn : T.bad
          }
        />
        <Stat label="테스트 평균" value={stats.testAvg} unit="%" tone={T.primary} />
        <Stat label="제출 횟수" value={stats.submittedCnt} unit="회" />
        <Stat label="출석 완료" value={stats.attendedCnt} unit="회" tone={T.ok} />
      </div>

      <Card style={{ padding: 18, marginBottom: 16 }}>
        <div
          style={{
            fontSize: 14.5,
            fontWeight: 800,
            color: T.ink,
            marginBottom: 14,
          }}
        >
          테스트 점수 추이 (100점 환산)
        </div>
        {stats.testRows.length === 0 ? (
          <Empty
            icon={<TrendingUp size={28} />}
            text="테스트 기록이 아직 없습니다"
          />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart
              data={stats.testRows}
              margin={{ top: 8, right: 10, left: -18, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={T.line}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: T.sub }}
                tickLine={false}
                axisLine={{ stroke: T.line }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 12, fill: T.sub }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 10,
                  border: `1px solid ${T.line}`,
                  fontSize: 13,
                }}
                formatter={(v: any, _n: any, p: any) => [
                  `${v}% (${p.payload.raw}/${p.payload.max})`,
                  "점수",
                ]}
              />
              <Line
                type="monotone"
                dataKey="pct"
                stroke={T.primary}
                strokeWidth={2.5}
                dot={{ r: 4, fill: T.primary }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card style={{ padding: 18 }}>
        <div
          style={{
            fontSize: 14.5,
            fontWeight: 800,
            color: T.ink,
            marginBottom: 14,
          }}
        >
          과제 수행 현황
        </div>
        <div
          style={{
            display: "flex",
            height: 14,
            borderRadius: 999,
            overflow: "hidden",
            background: T.badSoft,
            marginBottom: 10,
          }}
        >
          <div style={{ width: `${stats.hwRate}%`, background: T.ok }} />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 13,
            color: T.sub,
          }}
        >
          <span>완료 {stats.hwFullCnt}회</span>
          <span>부분(△) {stats.hwHalfCnt}회</span>
          <span>미수행 {stats.hwMissCnt}회</span>
        </div>
      </Card>
    </div>
  );
}

/* ============================== SCHOOL EXAMS ============================== */
type SchoolExamDraft = {
  schoolSubjectName: string;
  midtermScore: string;
  finalScore: string;
  grade: string;
};

const blankSchoolExamDraft = (): SchoolExamDraft => ({
  schoolSubjectName: "",
  midtermScore: "",
  finalScore: "",
  grade: "",
});

const schoolExamDraft = (result: SchoolExamResult): SchoolExamDraft => ({
  schoolSubjectName: result.schoolSubjectName,
  midtermScore:
    result.midtermScore == null ? "" : String(result.midtermScore),
  finalScore: result.finalScore == null ? "" : String(result.finalScore),
  grade: result.grade,
});

function SchoolExamEditor({
  termId,
  currentClasses,
  initial,
  onSaved,
}: {
  termId: string;
  currentClasses: string[];
  initial: SchoolExamResult[];
  onSaved: (results: SchoolExamResult[]) => void;
}) {
  const [rows, setRows] = useState<SchoolExamDraft[]>(() =>
    initial.length ? initial.map(schoolExamDraft) : [blankSchoolExamDraft()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const updateRow = (
    index: number,
    key: keyof SchoolExamDraft,
    value: string
  ) => {
    setRows((previous) =>
      previous.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row
      )
    );
    setError("");
    setSaved(false);
  };

  const parseScore = (label: string, value: string): number | null => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      throw new Error(`${label}은(는) 0점부터 100점 사이로 입력해주세요.`);
    }
    return parsed;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaved(false);

    let results: SchoolExamResult[];
    try {
      results = rows.map((row, index) => {
        const schoolSubjectName = row.schoolSubjectName.trim();
        if (!schoolSubjectName) {
          throw new Error(`${index + 1}번째 학교 과목명을 입력해주세요.`);
        }
        return {
          schoolSubjectName,
          midtermScore: parseScore("중간고사 성적", row.midtermScore),
          finalScore: parseScore("기말고사 성적", row.finalScore),
          grade: row.grade.trim(),
        };
      });
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "성적을 확인해주세요."
      );
      return;
    }

    setSaving(true);
    try {
      const savedResults = (await api.put("/api/school-exams", {
        term: termId,
        results,
      })) as SchoolExamResult[];
      setRows(savedResults.map(schoolExamDraft));
      setSaved(true);
      onSaved(savedResults);
    } catch (saveError: any) {
      setError(saveError.message || "성적 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card style={{ padding: 16, marginBottom: 14, color: T.sub, fontSize: 13.5 }}>
        현재 2학기 수강반: <b>{currentClasses.join(", ")}</b>
      </Card>

      <div style={{ display: "grid", gap: 14 }}>
        {rows.map((row, index) => (
          <Card key={index} style={{ padding: 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>
                1학기 학교 과목 {index + 1}
              </div>
              <Btn
                type="button"
                size="xs"
                variant="danger"
                onClick={() => {
                  setRows((previous) =>
                    previous.filter((_, rowIndex) => rowIndex !== index)
                  );
                  setError("");
                  setSaved(false);
                }}
              >
                <Trash2 size={14} /> 삭제
              </Btn>
            </div>
            <Field label="1학기 학교 과목명">
              <input
                type="text"
                maxLength={SCHOOL_EXAM_NAME_MAX_LENGTH}
                style={inputBase}
                value={row.schoolSubjectName}
                onChange={(e) =>
                  updateRow(index, "schoolSubjectName", e.target.value)
                }
                placeholder="예: 수학Ⅰ, 수학Ⅱ, 확률과 통계"
                aria-label={`${index + 1}번째 1학기 학교 과목명`}
                required
              />
            </Field>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 12,
              }}
            >
              <Field label="1학기 중간고사 성적">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  inputMode="decimal"
                  style={inputBase}
                  value={row.midtermScore}
                  onChange={(e) =>
                    updateRow(index, "midtermScore", e.target.value)
                  }
                  placeholder="0~100"
                />
              </Field>
              <Field label="1학기 기말고사 성적">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  inputMode="decimal"
                  style={inputBase}
                  value={row.finalScore}
                  onChange={(e) =>
                    updateRow(index, "finalScore", e.target.value)
                  }
                  placeholder="0~100"
                />
              </Field>
              <Field label="1학기 등급">
                <input
                  type="text"
                  maxLength={SCHOOL_EXAM_GRADE_MAX_LENGTH}
                  style={inputBase}
                  value={row.grade}
                  onChange={(e) => updateRow(index, "grade", e.target.value)}
                  placeholder="예: 2"
                />
              </Field>
            </div>
          </Card>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginTop: 14,
        }}
      >
        <Btn
          type="button"
          variant="soft"
          disabled={rows.length >= SCHOOL_EXAM_MAX_COUNT}
          onClick={() => {
            setRows((previous) => [...previous, blankSchoolExamDraft()]);
            setError("");
            setSaved(false);
          }}
        >
          <Plus size={16} /> 과목 추가
        </Btn>
        <Btn type="submit" disabled={saving}>
          <Save size={16} />
          {saving ? "저장 중…" : "전체 성적 저장"}
        </Btn>
        {saved && (
          <span role="status" style={{ color: T.ok, fontSize: 13, fontWeight: 700 }}>
            <CheckCircle2 size={16} style={{ verticalAlign: "middle" }} /> 저장되었습니다
          </span>
        )}
      </div>
      {error && (
        <div role="alert" style={{ color: T.bad, fontSize: 13, marginTop: 12 }}>
          {error}
        </div>
      )}
    </form>
  );
}

/* ============================== PORTAL ============================== */
export function StudentPortal({
  me,
  onLogout,
}: {
  me: Me;
  onLogout: () => void;
}) {
  const terms = me.terms ?? [];
  const [termId, setTermId] = useState(
    () => (terms.find((t) => t.active) ?? terms[0])?.id ?? ""
  );
  const selectedTermIdRef = useRef(termId);
  const term = terms.find((t) => t.id === termId) ?? terms[0];
  const subjects = term?.subjects ?? [];
  // 종료된 반은 새 입력을 받지 않는다. (이력·통계에서는 계속 볼 수 있다)
  const inputSubjects = useMemo(() => openSubjects(term), [term]);
  const schoolExamClasses = useMemo(
    () =>
      term?.active && term.schoolExamInput
        ? SCHOOL_EXAM_SUBJECTS.filter((examClass) =>
            subjects.includes(examClass)
          )
        : [],
    [subjects, term?.active, term?.schoolExamInput]
  );

  const [tab, setTab] = useState("input");
  const [subject, setSubject] = useState(
    () => openSubjects(term)[0] ?? subjects[0] ?? ""
  );
  const [date, setDate] = useState("");
  const clinicDates = useMemo(
    () => getClinicDatesForSubject(term, subject),
    [term, subject]
  );
  const [sessions, setSessions] = useState<ClinicSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const [schoolExamOverrides, setSchoolExamOverrides] = useState<
    Record<string, SchoolExamResult[]>
  >({});
  const showToast = (msg: string) => setToast({ id: Date.now(), msg });

  useEffect(() => {
    if (tab === "schoolExams" && schoolExamClasses.length === 0) {
      setTab("input");
    }
  }, [tab, schoolExamClasses.length]);

  // 이력·통계에서 종료된 반을 보다가 입력 탭으로 오면 진행 중인 반으로 되돌린다.
  useEffect(() => {
    if (tab !== "input" || inputSubjects.length === 0) return;
    setSubject((current) =>
      inputSubjects.includes(current) ? current : inputSubjects[0]
    );
  }, [tab, inputSubjects]);

  // 과목을 바꾸면 그 수업에 실제로 열리는 날짜만 유지한다.
  // 과목별 설정이 없는 기존 학기는 helper가 학기 공통 날짜로 폴백한다.
  useEffect(() => {
    setDate((currentDate) =>
      clinicDates.includes(currentDate)
        ? currentDate
        : pickDefaultDate(clinicDates)
    );
  }, [clinicDates]);

  const reloadSessions = async (requestedTermId: string) => {
    const nextSessions = await api.get(
      `/api/sessions?term=${requestedTermId}`
    );
    if (selectedTermIdRef.current !== requestedTermId) return false;
    setSessions(nextSessions);
    return true;
  };

  // 학기 변경 시: 과목·날짜 초기화 + 재조회
  useEffect(() => {
    if (!term) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const nextSubject = openSubjects(term)[0] ?? term.subjects[0] ?? "";
    setSubject(nextSubject);
    setDate(pickDefaultDate(getClinicDatesForSubject(term, nextSubject)));
    setErr("");
    setLoading(true);
    api
      .get(`/api/sessions?term=${term.id}`)
      .then((s) => {
        if (!cancelled) setSessions(s);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId]);

  const mine = sessions;
  const current = mine.find((s) => s.date === date && s.subject === subject);
  const readOnly = !term?.active; // 지난 학기는 조회 전용

  const handleSave = async (v: ClinicSession) => {
    if (!term) return;
    const operationTermId = term.id;
    const payload = {
      term: operationTermId,
      date,
      subject,
      attendance: v.attendance,
      lateTime: v.lateTime,
      absentReason: v.absentReason,
      sources: v.sources,
      sourcesEtc: v.sourcesEtc,
      qNumbers: v.qNumbers,
      qTypes: v.qTypes,
      qTypesEtc: v.qTypesEtc,
      request: v.request,
    };
    const isEdit = !!(current && current.id);
    try {
      if (isEdit) {
        await api.patch(`/api/sessions/${current.id}`, payload);
      } else {
        await api.post("/api/sessions", payload);
      }
      if (await reloadSessions(operationTermId)) {
        showToast(isEdit ? "수정이 완료되었습니다" : "제출이 완료되었습니다");
      }
    } catch (e: any) {
      alert(e.message || "저장에 실패했습니다.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!term) return;
    const operationTermId = term.id;
    try {
      await api.del(`/api/sessions/${id}`);
      if (await reloadSessions(operationTermId)) {
        showToast("삭제되었습니다");
      }
    } catch (e: any) {
      alert(e.message || "삭제에 실패했습니다.");
    }
  };

  const NAV: NavItem[] = [
    { k: "input", label: "클리닉 입력", icon: <ClipboardList size={18} /> },
    ...(schoolExamClasses.length
      ? [
          {
            k: "schoolExams",
            label: "1학기 성적 입력",
            icon: <FileText size={18} />,
          },
        ]
      : []),
    { k: "history", label: "내 이력", icon: <History size={18} /> },
    { k: "stats", label: "통계", icon: <TrendingUp size={18} /> },
  ];

  const handleSchoolExamSaved = (
    savedTermId: string,
    results: SchoolExamResult[]
  ) => {
    setSchoolExamOverrides((previous) => ({
      ...previous,
      [savedTermId]: results,
    }));
    showToast("1학기 학교 성적이 저장되었습니다");
  };

  // 학기 선택 바
  const termBar = terms.length > 0 && (
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
        onChange={(e) => {
          selectedTermIdRef.current = e.target.value;
          setTermId(e.target.value);
        }}
      >
        {terms.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
            {t.active ? " (진행중)" : ""}
          </option>
        ))}
      </select>
      {readOnly && (
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
          지난 학기 · 조회 전용
        </span>
      )}
    </div>
  );

  return (
    <>
    <Shell
      role="student"
      name={me.name}
      sub={`${term?.grade ?? ""}${term ? " · " : ""}${subjects.join(", ")}`}
      nav={NAV}
      tab={tab}
      setTab={setTab}
      onLogout={onLogout}
    >
      {terms.length === 0 ? (
        <div style={{ padding: 40, color: T.muted }}>
          등록된 학기가 없습니다. 선생님께 문의하세요.
        </div>
      ) : loading ? (
        <div style={{ padding: 40, color: T.muted }}>불러오는 중…</div>
      ) : err ? (
        <div style={{ padding: 40, color: T.bad }}>{err}</div>
      ) : (
        <>
          {termBar}
          {tab === "input" && (
            <div style={{ maxWidth: 640 }}>
              <SectionTitle>클리닉 입력</SectionTitle>
              {readOnly ? (
                <Card style={{ padding: 20, color: T.sub, fontSize: 14 }}>
                  지난 학기는 <b>내 이력·통계</b>에서 조회만 가능합니다. 입력은 진행중인
                  학기에서만 할 수 있어요.
                </Card>
              ) : inputSubjects.length === 0 ? (
                <Card style={{ padding: 20, color: T.sub, fontSize: 14 }}>
                  진행 중인 수업이 없습니다. 종료된 수업 기록은 <b>내 이력·통계</b>에서
                  확인할 수 있어요.
                </Card>
              ) : (
                <>
                  <Card style={{ padding: 16, marginBottom: 16 }}>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 150 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.sub, marginBottom: 6 }}>
                          과목
                        </div>
                        <select
                          style={inputBase}
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                        >
                          {inputSubjects.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ flex: 1, minWidth: 150 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.sub, marginBottom: 6 }}>
                          클리닉 날짜
                        </div>
                        <select
                          style={inputBase}
                          value={date}
                          disabled={clinicDates.length === 0}
                          onChange={(e) => setDate(e.target.value)}
                        >
                          {clinicDates.length === 0 ? (
                            <option value="">등록된 날짜 없음</option>
                          ) : (
                            clinicDates.map((d) => (
                              <option key={d} value={d}>
                                {md(d)}
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                    </div>
                  </Card>

                  {!date ? (
                    <Card style={{ padding: 20, color: T.sub, fontSize: 14 }}>
                      선택한 과목에 등록된 클리닉 날짜가 없습니다.
                    </Card>
                  ) : current?.submitted ? (
                    <Card style={{ padding: 20 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, color: T.ok, fontWeight: 700, fontSize: 14 }}>
                        <CheckCircle2 size={18} /> {md(date)} 응답이 제출되었습니다. 자유롭게 수정하거나 삭제할 수 있어요.
                      </div>
                      <ClinicForm
                        key={`${date}|${subject}|edit`}
                        initial={{ ...current, _existing: true }}
                        onSave={handleSave}
                        onDelete={() => handleDelete(current.id)}
                      />
                    </Card>
                  ) : (
                    <Card style={{ padding: 20 }}>
                      <ClinicForm
                        key={`${date}|${subject}|new`}
                        initial={blankSession(me.id, date, subject)}
                        onSave={handleSave}
                      />
                    </Card>
                  )}
                </>
              )}
            </div>
          )}

          {tab === "history" && (
            <StudentHistory
              mine={mine}
              subject={subject}
              setSubject={setSubject}
              subjects={subjects}
            />
          )}
          {tab === "stats" && (
            <StudentStats
              mine={mine}
              subject={subject}
              setSubject={setSubject}
              subjects={subjects}
            />
          )}
          {tab === "schoolExams" && schoolExamClasses.length > 0 && term && (
            <div style={{ maxWidth: 860 }}>
              <SectionTitle>1학기 성적 입력</SectionTitle>
              <Card
                style={{
                  padding: 16,
                  marginBottom: 16,
                  color: T.sub,
                  fontSize: 13.5,
                  lineHeight: 1.6,
                }}
              >
                1학기에 학교에서 실제로 수강한 과목을 모두 추가하고, 각 과목의
                중간·기말고사 성적과 등급을 입력해주세요.
              </Card>
              <SchoolExamEditor
                key={term.id}
                termId={term.id}
                currentClasses={schoolExamClasses}
                initial={
                  schoolExamOverrides[term.id] ?? term.schoolExamResults ?? []
                }
                onSaved={(results) => handleSchoolExamSaved(term.id, results)}
              />
            </div>
          )}
        </>
      )}
    </Shell>
    <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
