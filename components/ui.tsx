"use client";

import React from "react";
import { CheckCircle2, X } from "lucide-react";
import { T, FONT } from "@/lib/constants";

/* ============================== UI PRIMITIVES ============================== */
type BtnVariant =
  | "primary"
  | "accent"
  | "soft"
  | "outline"
  | "ghost"
  | "danger";

export function Btn({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled,
  style = {},
  title,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  size?: "md" | "sm" | "xs";
  disabled?: boolean;
  style?: React.CSSProperties;
  title?: string;
  type?: "button" | "submit";
}) {
  const pad = size === "sm" ? "6px 11px" : size === "xs" ? "4px 9px" : "9px 16px";
  const fs = size === "sm" || size === "xs" ? 13 : 14.5;
  const map: Record<BtnVariant, { bg: string; col: string; bd: string }> = {
    primary: { bg: T.primary, col: "#fff", bd: T.primary },
    accent: { bg: T.accent, col: "#3a2c05", bd: T.accent },
    soft: { bg: T.primarySoft, col: T.primary, bd: T.primarySoft },
    outline: { bg: "#fff", col: T.ink, bd: T.line },
    ghost: { bg: "transparent", col: T.sub, bd: "transparent" },
    danger: { bg: "#fff", col: T.bad, bd: T.badSoft },
  };
  const m = map[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: pad,
        fontSize: fs,
        fontWeight: 600,
        fontFamily: FONT,
        lineHeight: 1.1,
        color: m.col,
        background: m.bg,
        border: `1px solid ${m.bd}`,
        borderRadius: 10,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "filter .12s",
        whiteSpace: "nowrap",
        ...style,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(0.96)")}
      onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.line}`,
        borderRadius: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Pill({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "ok" | "warn" | "bad" | "primary" | "muted";
}) {
  const map = {
    ok: [T.okSoft, T.ok],
    warn: [T.warnSoft, T.warn],
    bad: [T.badSoft, T.bad],
    primary: [T.primarySoft, T.primary],
    muted: ["#EEF1F6", T.sub],
  } as const;
  const m = map[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 700,
        background: m[0],
        color: m[1],
      }}
    >
      {children}
    </span>
  );
}

export const inputBase: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 14.5,
  fontFamily: FONT,
  color: T.ink,
  background: "#fff",
  border: `1px solid ${T.line}`,
  borderRadius: 10,
  outline: "none",
  boxSizing: "border-box",
};

export const lbl: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: T.sub,
  marginBottom: 6,
};

export function Field({
  label,
  children,
  hint,
}: {
  label?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      {label && (
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: T.ink,
            marginBottom: 6,
          }}
        >
          {label}
        </div>
      )}
      {hint && (
        <div
          style={{
            fontSize: 12.5,
            color: T.sub,
            marginBottom: 8,
            whiteSpace: "pre-line",
            lineHeight: 1.5,
          }}
        >
          {hint}
        </div>
      )}
      {children}
    </label>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 560,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  width?: number;
}) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,28,45,.42)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 16px",
        zIndex: 60,
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 18,
          width: "100%",
          maxWidth: width,
          boxShadow: "0 24px 60px rgba(15,25,50,.28)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: `1px solid ${T.line}`,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>
            {title}
          </div>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: T.sub,
              display: "flex",
            }}
          >
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

export function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "7px 2px",
        cursor: "pointer",
        fontSize: 14.5,
        color: T.ink,
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: 6,
          border: `1.5px solid ${checked ? T.primary : T.line}`,
          background: checked ? T.primary : "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {checked && <CheckCircle2 size={13} color="#fff" strokeWidth={3} />}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ display: "none" }}
      />
      {label}
    </label>
  );
}

export function Radio({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "7px 2px",
        cursor: "pointer",
        fontSize: 14.5,
        color: T.ink,
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          border: `2px solid ${checked ? T.primary : T.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {checked && (
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: T.primary,
            }}
          />
        )}
      </span>
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        style={{ display: "none" }}
      />
      {label}
    </label>
  );
}

export function Empty({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "44px 20px",
        color: T.muted,
        fontSize: 14,
      }}
    >
      <div
        style={{
          marginBottom: 10,
          display: "flex",
          justifyContent: "center",
          opacity: 0.6,
        }}
      >
        {icon}
      </div>
      {text}
    </div>
  );
}

export function SectionTitle({
  children,
  noMargin,
}: {
  children: React.ReactNode;
  noMargin?: boolean;
}) {
  return (
    <h2
      style={{
        fontSize: 20,
        fontWeight: 800,
        color: T.ink,
        margin: noMargin ? 0 : "0 0 16px",
      }}
    >
      {children}
    </h2>
  );
}

export function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        background: "#E7ECF3",
        borderRadius: 10,
        padding: 3,
        gap: 3,
      }}
    >
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          style={{
            padding: "7px 16px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontFamily: FONT,
            fontSize: 13.5,
            fontWeight: 700,
            color: value === o ? T.primary : T.sub,
            background: value === o ? "#fff" : "transparent",
            boxShadow: value === o ? "0 1px 3px rgba(0,0,0,.08)" : "none",
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function MiniToggle({
  active,
  tone,
  onClick,
  label,
}: {
  active: boolean;
  tone: "ok" | "warn" | "bad";
  onClick: () => void;
  label: string;
}) {
  const c = tone === "ok" ? T.ok : tone === "warn" ? T.warn : T.bad;
  const soft = tone === "ok" ? T.okSoft : tone === "warn" ? T.warnSoft : T.badSoft;
  return (
    <button
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        fontWeight: 800,
        fontSize: 13,
        cursor: "pointer",
        border: `1px solid ${active ? c : T.line}`,
        background: active ? soft : "#fff",
        color: active ? c : T.muted,
        fontFamily: FONT,
      }}
    >
      {label}
    </button>
  );
}
