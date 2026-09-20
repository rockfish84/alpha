"use client";

import React, { useEffect, useRef, useState } from "react";
import { T } from "@/lib/constants";
import { loadPdfjs } from "@/lib/pdf-extract";
import type { QuestionRegion, RegionRect } from "@/lib/analysis-types";

/** 같은 PDF를 여러 번 열어도 한 번만 내려받도록 문서를 캐시한다. */
const docCache = new Map<string, Promise<any>>();

function getDoc(fileId: string) {
  let p = docCache.get(fileId);
  if (!p) {
    p = (async () => {
      const pdfjs = await loadPdfjs();
      const res = await fetch(`/api/files/${fileId}`, { cache: "force-cache" });
      if (!res.ok) throw new Error("자료를 불러오지 못했습니다.");
      const data = await res.arrayBuffer();
      return pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
    })();
    docCache.set(fileId, p);
  }
  return p;
}

const MAX_SCALE = 2.5;

/** 캔버스에서 내용이 있는 부분만 남기고 둘레 여백을 잘라낸다. */
function trimCanvas(canvas: HTMLCanvasElement, pad = 8): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const { width: w, height: h } = canvas;
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return canvas; // 교차 출처 등으로 못 읽으면 원본 그대로
  }
  let top = h,
    bottom = -1,
    left = w,
    right = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // 흰 바탕보다 조금이라도 어두우면 내용으로 본다
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (luma < 248) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bottom < 0) return canvas; // 빈 영역

  const x0 = Math.max(0, left - pad);
  const y0 = Math.max(0, top - pad);
  const x1 = Math.min(w, right + pad + 1);
  const y1 = Math.min(h, bottom + pad + 1);
  if (x1 - x0 >= w && y1 - y0 >= h) return canvas; // 자를 게 없음

  const out = document.createElement("canvas");
  out.width = x1 - x0;
  out.height = y1 - y0;
  const octx = out.getContext("2d");
  if (!octx) return canvas;
  octx.fillStyle = "#fff";
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/**
 * 문항 영역을 잘라 이미지로 만든다. (오답 PDF 만들기에서 사용)
 * targetWidth 는 결과 이미지의 가로 픽셀 수 기준.
 * trim 을 켜면 문항 둘레의 빈 여백을 잘라내어 종이를 알차게 쓴다.
 */
export async function renderRegionImages(
  fileId: string,
  rects: RegionRect[],
  targetWidth = 720,
  opts: {
    trim?: boolean;
    /** 인쇄용은 PNG를 쓰면 가는 글씨·수식의 JPEG 번짐을 피할 수 있다. */
    format?: "jpeg" | "png";
    jpegQuality?: number;
    /** PDF.js 렌더 배율 상한. 화면용 기본값은 4, 고화질 인쇄는 더 높일 수 있다. */
    maxScale?: number;
  } = {}
): Promise<{ dataUrl: string; width: number; height: number }[]> {
  const doc = await getDoc(fileId);
  const out: { dataUrl: string; width: number; height: number }[] = [];
  for (const rect of rects) {
    if (rect.w <= 0 || rect.h <= 0) continue;
    const page = await doc.getPage(rect.page);
    const scale = Math.min(opts.maxScale ?? 4, Math.max(1, targetWidth / rect.w));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(rect.w * scale);
    canvas.height = Math.ceil(rect.h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvasContext: ctx,
      viewport,
      transform: [1, 0, 0, 1, -rect.x * scale, -rect.y * scale],
    }).promise;
    const final = opts.trim ? trimCanvas(canvas) : canvas;
    const dataUrl =
      opts.format === "png"
        ? final.toDataURL("image/png")
        : final.toDataURL("image/jpeg", opts.jpegQuality ?? 0.82);
    out.push({
      dataUrl,
      width: final.width,
      height: final.height,
    });
  }
  return out;
}

/** 문항 영역(여러 조각일 수 있음)을 잘라서 그린다. */
export function PdfRegionView({
  fileId,
  rects,
  width = 640,
}: {
  fileId: string;
  rects: RegionRect[];
  width?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = "";
    setErr("");
    setLoading(true);

    (async () => {
      try {
        const doc = await getDoc(fileId);
        if (cancelled) return;
        for (const rect of rects) {
          if (rect.w <= 0 || rect.h <= 0) continue;
          const page = await doc.getPage(rect.page);
          if (cancelled) return;
          const scale = Math.min(MAX_SCALE, Math.max(1, width / rect.w));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const ratio = Math.min(2, window.devicePixelRatio || 1);
          canvas.width = Math.ceil(rect.w * scale * ratio);
          canvas.height = Math.ceil(rect.h * scale * ratio);
          canvas.style.width = "100%";
          canvas.style.maxWidth = `${Math.ceil(rect.w * scale)}px`;
          canvas.style.height = "auto";
          canvas.style.display = "block";
          canvas.style.background = "#fff";
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({
            canvasContext: ctx,
            viewport,
            // 필요한 영역만 보이도록 페이지를 옮겨 그린다.
            transform: [ratio, 0, 0, ratio, -rect.x * scale * ratio, -rect.y * scale * ratio],
          }).promise;
          if (cancelled) return;
          host.appendChild(canvas);
        }
        if (!cancelled) setLoading(false);
      } catch (e: any) {
        console.error("[PdfRegionView]", e);
        if (!cancelled) {
          setErr(e?.message || "자료를 불러오지 못했습니다.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId, rects, width]);

  return (
    <div>
      {loading && (
        <div style={{ padding: 20, color: T.muted, fontSize: 13 }}>불러오는 중…</div>
      )}
      {err && <div style={{ padding: 20, color: T.bad, fontSize: 13 }}>{err}</div>}
      <div ref={hostRef} style={{ display: "flex", flexDirection: "column", gap: 6 }} />
    </div>
  );
}

/** 해설지 영역을 "문제" 와 "정답·해설" 로 나눠 준다. */
export function splitSolutionRects(region: QuestionRegion): {
  question: RegionRect[];
  answer: RegionRect[];
} {
  const { rects, answerRect, answerY } = region;
  if (answerRect == null || answerY == null) {
    return { question: rects, answer: rects };
  }
  const question: RegionRect[] = [];
  const answer: RegionRect[] = [];
  rects.forEach((r, i) => {
    if (i < answerRect) {
      question.push(r);
      return;
    }
    if (i > answerRect) {
      answer.push(r);
      return;
    }
    const cut = Math.max(r.y, Math.min(answerY, r.y + r.h));
    if (cut - r.y > 8) question.push({ ...r, h: cut - r.y });
    const rest = r.y + r.h - cut;
    if (rest > 8) answer.push({ ...r, y: cut, h: rest });
  });
  return {
    question: question.length ? question : rects,
    answer: answer.length ? answer : rects,
  };
}

/** 한 문항의 "문제" / "정답·해설" 영역을 고른다. */
export function pickRegions(regions: QuestionRegion[] | undefined) {
  const paper = regions?.find((r) => r.kind === "paper");
  const solution = regions?.find((r) => r.kind === "solution");
  const split = solution ? splitSolutionRects(solution) : null;
  const question = paper
    ? { fileId: paper.fileId, rects: paper.rects }
    : split && solution
    ? { fileId: solution.fileId, rects: split.question }
    : null;
  const answer =
    split && solution ? { fileId: solution.fileId, rects: split.answer } : null;
  return { question, answer };
}
