"use client";

import React from "react";
import { LogOut, User, Shield, GraduationCap } from "lucide-react";
import { T, FONT } from "@/lib/constants";
import { Btn } from "./ui";

export interface NavItem {
  k: string;
  label: string;
  icon: React.ReactNode;
}

export function Shell({
  role,
  name,
  sub,
  nav,
  tab,
  setTab,
  children,
  onLogout,
}: {
  role: "student" | "admin";
  name: string;
  sub: string;
  nav: NavItem[];
  tab: string;
  setTab: (k: string) => void;
  children: React.ReactNode;
  onLogout: () => void;
}) {
  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: FONT }}>
      {/* Top bar */}
      <header
        style={{
          background: "#fff",
          borderBottom: `1px solid ${T.line}`,
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <div
          style={{
            maxWidth: 1120,
            margin: "0 auto",
            padding: "0 18px",
            height: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: T.primary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <GraduationCap size={19} color="#fff" />
            </div>
            <div>
              <div
                style={{
                  fontSize: 15.5,
                  fontWeight: 800,
                  color: T.ink,
                  lineHeight: 1.1,
                }}
              >
                더브코 <span style={{ color: T.accent }}>알파 클리닉</span>
              </div>
              <div style={{ fontSize: 11.5, color: T.muted }}>
                {role === "admin" ? "관리자 콘솔" : "학생 포털"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  background: role === "admin" ? T.warnSoft : T.primarySoft,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {role === "admin" ? (
                  <Shield size={16} color={T.warn} />
                ) : (
                  <User size={16} color={T.primary} />
                )}
              </div>
              <div style={{ lineHeight: 1.15 }}>
                <div
                  style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}
                >
                  {name}
                </div>
                <div style={{ fontSize: 11.5, color: T.muted }}>{sub}</div>
              </div>
            </div>
            <Btn variant="outline" size="sm" onClick={onLogout}>
              <LogOut size={15} />
              로그아웃
            </Btn>
          </div>
        </div>
        {/* Tabs */}
        <div
          style={{
            maxWidth: 1120,
            margin: "0 auto",
            padding: "0 18px",
            display: "flex",
            gap: 4,
            overflowX: "auto",
          }}
        >
          {nav.map((n) => (
            <button
              key={n.k}
              onClick={() => setTab(n.k)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "12px 14px",
                border: "none",
                cursor: "pointer",
                background: "transparent",
                fontFamily: FONT,
                fontSize: 14,
                fontWeight: 700,
                whiteSpace: "nowrap",
                color: tab === n.k ? T.primary : T.sub,
                borderBottom: `2.5px solid ${
                  tab === n.k ? T.primary : "transparent"
                }`,
                marginBottom: -1,
              }}
            >
              {n.icon}
              {n.label}
            </button>
          ))}
        </div>
      </header>
      <main
        style={{ maxWidth: 1120, margin: "0 auto", padding: "24px 18px 60px" }}
      >
        {children}
      </main>
    </div>
  );
}
