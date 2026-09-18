"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Wand2, Save } from "lucide-react";
import { T } from "@/lib/constants";
import { api } from "@/lib/api";
import { FILE_KIND_LABEL, type FileMeta } from "@/lib/analysis-types";
import {
  autoSelectStarts,
  blockId,
  buildRegions,
  detectBlocks,
  regionRectsFor,
  type BlockId,
  type DetectedPage,
} from "@/lib/pdf-extract";
import { Btn, Modal, Pill } from "./ui";

/** 파일 종류 → 문항 위치 종류 (답지는 해설지). */
const regionKindOf = (kind: string): "paper" | "solution" =>
  kind === "answer" ? "solution" : "paper";

/**
 * 업로드한 PDF에서 문항이 시작하는 위치를 확인·수정하는 화면.
 * 자동으로 잡아 주고, 틀린 곳만 눌러서 고치면 된다.
 */
export function RegionMarker({
  open,
  file,
  termId,
  subject,
  date,
  questionNos,
  onClose,
  onSaved,
}: {
  open: boolean;
  file: FileMeta | null;
  termId: string;
  subject: string;
  date: string;
  questionNos: number[];
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const [pages, setPages] = useState<DetectedPage[]>([]);
  const [starts, setStarts] = useState<Set<BlockId>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const hostRef = useRef<HTMLDivElement>(null);

  const expected = questionNos.length;

  useEffect(() => {
    if (!open || !file) return;
    let cancelled = false;
    setLoading(true);
    setErr("");
    setPages([]);
    (async () => {
      try {
        const res = await fetch(`/api/files/${file.id}`, { cache: "force-cache" });
        if (!res.ok) throw new Error("파일을 불러오지 못했습니다.");
        const detected = await detectBlocks(await res.arrayBuffer(), {
          keepCanvas: true,
        });
        if (cancelled) return;
        setPages(detected);
        setStarts(autoSelectStarts(detected, expected));
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "문항 위치를 분석하지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, file, expected]);

  // 실제로 저장될 영역 (문항 시작 ~ 다음 문항 시작 직전)
  const groupRects = useMemo(
    () => regionRectsFor(pages, starts),
    [pages, starts]
  );

  const toggle = useCallback((id: BlockId) => {
    setStarts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const save = async () => {
    if (!file) return;
    setSaving(true);
    try {
      const regions = buildRegions(
        pages,
        starts,
        questionNos,
        regionKindOf(file.kind),
        file.id
      );
      await api.put("/api/admin/regions", {
        term: termId,
        subject,
        date,
        fileId: file.id,
        regions,
      });
      onSaved(regions.length);
      onClose();
    } catch (e: any) {
      alert(e?.message || "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  // 캔버스를 화면에 붙인다 (페이지 미리보기)
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    for (const p of pages) {
      const slot = host.querySelector<HTMLDivElement>(`[data-page="${p.page}"]`);
      if (slot && p.canvas && !slot.contains(p.canvas)) {
        p.canvas.style.width = "100%";
        p.canvas.style.height = "auto";
        p.canvas.style.display = "block";
        slot.appendChild(p.canvas);
      }
    }
  }, [pages]);

  const selected = starts.size;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={920}
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          문항 위치 확인 · {file ? FILE_KIND_LABEL[file.kind] : ""}
          <Pill tone={selected === expected ? "ok" : "warn"}>
            선택 {selected} / 필요 {expected}
          </Pill>
        </span>
      }
    >
      <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.65, marginBottom: 12 }}>
색칠된 영역이 <b>그 문항으로 저장될 범위</b>입니다. 문항이 시작하는 곳(굵은 테두리)이
        잘못 잡혔으면 블록을 눌러서 켜고 끄면 번호와 범위가 다시 계산됩니다. (해설이 다음
        단·다음 장으로 이어지는 부분은 <b>끄면</b> 앞 문항에 이어 붙습니다)
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Btn
          variant="outline"
          size="sm"
          disabled={loading || !pages.length}
          onClick={() => setStarts(autoSelectStarts(pages, expected))}
        >
          <Wand2 size={14} /> 자동 선택 다시
        </Btn>
        <Btn variant="outline" size="sm" disabled={loading} onClick={() => setStarts(new Set())}>
          전체 해제
        </Btn>
        <div style={{ flex: 1 }} />
        <Btn onClick={save} disabled={saving || loading || !pages.length}>
          <Save size={14} /> {saving ? "저장 중…" : "이 위치로 저장"}
        </Btn>
      </div>

      {loading && <div style={{ padding: 30, color: T.muted }}>PDF를 분석하는 중…</div>}
      {err && <div style={{ padding: 20, color: T.bad }}>{err}</div>}

      <div ref={hostRef} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {pages.map((p) => (
          <div key={p.page}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>
              {p.page} 쪽
            </div>
            <div
              data-page={p.page}
              style={{
                position: "relative",
                border: `1px solid ${T.line}`,
                borderRadius: 8,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              {/* 저장될 문항 영역 (잘리는 부분 없이 보이는 그대로 저장된다) */}
              {groupRects
                .filter((r) => r.page === p.page)
                .map((r, i) => (
                  <div
                    key={`g${i}`}
                    style={{
                      position: "absolute",
                      left: `${(r.x / p.width) * 100}%`,
                      top: `${(r.y / p.height) * 100}%`,
                      width: `${(r.w / p.width) * 100}%`,
                      height: `${(r.h / p.height) * 100}%`,
                      background:
                        r.group % 2 === 0
                          ? "rgba(44,74,130,.10)"
                          : "rgba(223,160,46,.16)",
                      border: `1px solid ${
                        r.group % 2 === 0 ? "rgba(44,74,130,.45)" : "rgba(223,160,46,.6)"
                      }`,
                      borderRadius: 4,
                      pointerEvents: "none",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: -9,
                        top: -9,
                        minWidth: 20,
                        height: 20,
                        borderRadius: 999,
                        background: T.primary,
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 800,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 5px",
                      }}
                    >
                      {questionNos[r.group] ?? "?"}
                    </span>
                  </div>
                ))}

              {/* 문항 시작 위치 토글 (블록 단위) */}
              {p.columns.map((col, ci) =>
                col.blocks.map((b, i) => {
                  const id = blockId(p.page, ci, i);
                  const on = starts.has(id);
                  return (
                    <button
                      key={id}
                      onClick={() => toggle(id)}
                      title={on ? "이 문항 시작 해제" : "여기서 새 문항 시작"}
                      style={{
                        position: "absolute",
                        left: `${(b.left / p.width) * 100}%`,
                        top: `${(b.top / p.height) * 100}%`,
                        width: `${((b.right - b.left) / p.width) * 100}%`,
                        height: `${((b.bottom - b.top) / p.height) * 100}%`,
                        border: on
                          ? `2px solid ${T.primary}`
                          : `1px dashed rgba(120,135,160,.5)`,
                        borderRadius: 4,
                        background: "transparent",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    />
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
