"use client";

import React, { useState } from "react";
import { KeyRound, ShieldCheck, User, Users } from "lucide-react";
import { T, type Me } from "@/lib/constants";
import { api } from "@/lib/api";
import { Btn, Card, Field, SectionTitle, inputBase } from "./ui";

const MIN_LENGTH = 4;

export function MyPage({ me, onDone }: { me: Me; onDone?: (msg: string) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);

  const isParent = me.role === "parent";

  const submit = async () => {
    setErr("");
    setOk("");
    if (!current || !next) {
      setErr("현재 비밀번호와 새 비밀번호를 입력해주세요.");
      return;
    }
    if (next.length < MIN_LENGTH) {
      setErr(`새 비밀번호는 ${MIN_LENGTH}자 이상이어야 합니다.`);
      return;
    }
    if (next !== confirm) {
      setErr("새 비밀번호가 서로 다릅니다.");
      return;
    }
    setSaving(true);
    try {
      await api.patch("/api/account/password", { current, next });
      setCurrent("");
      setNext("");
      setConfirm("");
      setOk("비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.");
      onDone?.("비밀번호가 변경되었습니다");
    } catch (e: any) {
      setErr(e.message || "변경에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 520 }}>
      <SectionTitle>마이페이지</SectionTitle>

      <Card style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: isParent ? T.warnSoft : T.primarySoft,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isParent ? (
              <Users size={20} color={T.warn} />
            ) : (
              <User size={20} color={T.primary} />
            )}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>
              {isParent ? `${me.studentName ?? me.name} 학생 학부모` : me.name}
            </div>
            <div style={{ fontSize: 12.5, color: T.sub }}>
              아이디 <b>{me.username ?? "—"}</b> ·{" "}
              {isParent ? "학부모 계정 (조회 전용)" : "학생 계정"}
            </div>
          </div>
        </div>
        {isParent && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              background: "#F6F8FB",
              borderRadius: 10,
              fontSize: 12.5,
              color: T.sub,
              lineHeight: 1.6,
            }}
          >
            학부모 계정은 자녀의 출결·과제·테스트 성적을 <b>조회</b>할 수 있습니다. 클리닉
            입력은 학생 계정에서만 가능합니다.
          </div>
        )}
      </Card>

      <Card style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <KeyRound size={17} color={T.primary} />
          <span style={{ fontSize: 15.5, fontWeight: 800, color: T.ink }}>
            비밀번호 변경
          </span>
        </div>

        <Field label="현재 비밀번호">
          <input
            style={inputBase}
            type="password"
            value={current}
            autoComplete="current-password"
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="새 비밀번호" hint={`${MIN_LENGTH}자 이상`}>
          <input
            style={inputBase}
            type="password"
            value={next}
            autoComplete="new-password"
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Field label="새 비밀번호 확인">
          <input
            style={inputBase}
            type="password"
            value={confirm}
            autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </Field>

        {err && (
          <div style={{ color: T.bad, fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
            {err}
          </div>
        )}
        {ok && (
          <div
            style={{
              color: T.ok,
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <ShieldCheck size={15} />
            {ok}
          </div>
        )}

        <Btn onClick={submit} disabled={saving} style={{ width: "100%", justifyContent: "center" }}>
          {saving ? "변경 중…" : "비밀번호 변경"}
        </Btn>
      </Card>
    </div>
  );
}
