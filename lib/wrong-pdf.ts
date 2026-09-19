// 오답 노트에서 고른 문항만 모아 A4 PDF 로 만든다.
// 시험지처럼 2단으로 채우되, 빈 곳이 크게 남지 않도록 단을 끝까지 채운다.
// (문제지는 남는 자리를 문항 아래 "풀 공간"으로 나눠 준다)
import type { RegionRect } from "./analysis-types";

export interface PdfItem {
  /** 표시용 제목 (예: "9/12(토) 3번 · 미분계수") */
  title: string;
  question?: { fileId: string; rects: RegionRect[] };
  answer?: { fileId: string; rects: RegionRect[] };
}

export interface PdfOptions {
  subject: string;
  studentName: string;
  /** question = 문제지(풀 공간 포함) · answer = 해설지 */
  mode: "question" | "answer";
  onProgress?: (done: number, total: number) => void;
}

/* A4 세로 (mm) */
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 10;
const GUTTER = 6;
const HEADER_H = 12;
const LABEL_H = 5.2;
const ITEM_GAP = 5;
/** 남은 자리가 자연 높이의 이만큼은 돼야 줄여서 그 단에 넣는다 (너무 작게 줄이지 않도록) */
const MIN_FIT = 0.62;
/** 해설지에서 문항 사이에 둘 최대 여백 (mm) */
const MAX_SPREAD = 18;
/** 문제지에서 문항 아래에 남길 최소 풀 공간 (mm) */
const MIN_WORK_SPACE = 10;

const COL_W = (PAGE_W - MARGIN * 2 - GUTTER) / 2;
const CONTENT_TOP = MARGIN + HEADER_H;
const CONTENT_H = PAGE_H - CONTENT_TOP - MARGIN;

type Img = { dataUrl: string; width: number; height: number };
type Block = { label: string; images: Img[] };

/**
 * 글자를 이미지로 만든다.
 * jsPDF 기본 폰트에는 한글이 없어서, 라벨·머리글은 브라우저 캔버스로 그려 넣는다.
 * (한글 폰트 파일을 PDF 에 넣지 않아도 되므로 용량도 가볍다)
 */
function textImage(
  text: string,
  widthPx: number,
  opts: { size?: number; color?: string; align?: "left" | "right"; bold?: boolean } = {}
): Img {
  const size = opts.size ?? 22;
  const pad = 2;
  const height = Math.ceil(size * 1.5);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(widthPx);
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dataUrl: "", width: canvas.width, height };
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = opts.color ?? "#4A5568";
  ctx.font = `${opts.bold ? "bold " : ""}${size}px 'Pretendard','Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = opts.align ?? "left";
  const x = opts.align === "right" ? canvas.width - pad : pad;
  ctx.fillText(text, x, height / 2, canvas.width - pad * 2);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), width: canvas.width, height };
}

/** 한 단에 담긴 문항 하나 (그릴 높이와 축소 비율) */
export interface PackedItem {
  index: number;
  height: number;
  /** 1 이면 원래 크기, 1 미만이면 줄여서 넣는다 */
  shrink: number;
}

/**
 * 문항들을 순서대로 단(column)에 담는다. (순수 계산 — 브라우저가 필요 없다)
 *
 * 남은 자리에 그대로 들어가면 담고, 조금 모자라면 줄여서 그 단을 끝까지 채운다.
 * 문제지는 문항마다 풀 공간(workSpace)을 미리 확보해 둔다.
 */
export function packColumns(
  heights: number[],
  opts: { contentH?: number; workSpace?: number; shrinkToFit?: boolean } = {}
): PackedItem[][] {
  const contentH = opts.contentH ?? CONTENT_H;
  const workSpace = opts.workSpace ?? 0;
  // 해설지는 남는 자리를 없애려고 조금 줄여서라도 채운다.
  // 문제지는 줄이지 않는다 — 남는 자리가 곧 풀 공간이라 버리는 공간이 아니다.
  const shrinkToFit = opts.shrinkToFit ?? true;
  const columns: PackedItem[][] = [];
  let cur: PackedItem[] = [];
  let used = 0;

  const flush = () => {
    if (cur.length) columns.push(cur);
    cur = [];
    used = 0;
  };

  heights.forEach((natural, index) => {
    const gap = cur.length ? ITEM_GAP : 0;
    const room = contentH - used - gap;

    if (natural + workSpace <= room) {
      cur.push({ index, height: natural, shrink: 1 });
      used += gap + natural + workSpace;
      return;
    }
    // 남은 자리가 제법 되면 조금 줄여서 이 단을 끝까지 채운다
    if (shrinkToFit && room >= natural * MIN_FIT && room > LABEL_H + 12) {
      cur.push({
        index,
        height: room,
        shrink: (room - LABEL_H) / (natural - LABEL_H),
      });
      flush();
      return;
    }
    flush();
    // 새 단에서도 넘치면 한 단 크기에 맞춰 줄인다
    const height = Math.min(natural, contentH);
    cur.push({
      index,
      height,
      shrink: natural > contentH ? (contentH - LABEL_H) / (natural - LABEL_H) : 1,
    });
    used = height + workSpace;
  });
  flush();
  return columns;
}

/** 한 단에서 문항마다 나눠 가질 여유 공간 (mm) */
export function spacingFor(
  items: { height: number }[],
  wantQuestion: boolean,
  contentH: number = CONTENT_H
): number {
  if (!items.length) return 0;
  const content = items.reduce((a, p) => a + p.height, 0);
  const leftover = Math.max(0, contentH - content - (items.length - 1) * ITEM_GAP);
  const share = leftover / items.length;
  // 문제지는 남는 자리를 전부 풀 공간으로, 해설지는 너무 벌어지지 않게 제한한다.
  return wantQuestion ? share : Math.min(share, MAX_SPREAD);
}

/** 이미지 폭을 칸 너비에 맞췄을 때의 높이(mm) */
function blockHeight(block: Block): number {
  const imgs = block.images.reduce(
    (a, im) => a + (COL_W * im.height) / im.width,
    0
  );
  return LABEL_H + imgs;
}

export async function buildWrongNotePdf(
  items: PdfItem[],
  opts: PdfOptions
): Promise<{ pages: number; included: number; skipped: string[] }> {
  const { renderRegionImages } = await import("@/components/PdfRegionView");
  const { jsPDF } = await import("jspdf");

  const wantQuestion = opts.mode === "question";
  const blocks: Block[] = [];
  const skipped: string[] = [];

  const total = items.length;
  let done = 0;
  for (const item of items) {
    const source = wantQuestion ? item.question : item.answer;
    if (!source) {
      skipped.push(item.title);
    } else {
      blocks.push({
        label: wantQuestion ? item.title : `${item.title} — 답·해설`,
        images: await renderRegionImages(source.fileId, source.rects),
      });
    }
    done += 1;
    opts.onProgress?.(done, total);
  }

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const kindLabel = wantQuestion ? "문제" : "해설";
  let page = 1;

  const drawHeader = () => {
    const title = textImage(
      `${opts.subject} · ${opts.studentName} 오답 ${kindLabel}`,
      1200,
      { size: 24, color: "#5A6578", bold: true }
    );
    const w = PAGE_W - MARGIN * 2 - 14;
    doc.addImage(title.dataUrl, "JPEG", MARGIN, MARGIN, w, (w * title.height) / title.width);
    const num = textImage(String(page), 120, { size: 24, color: "#93A0B4", align: "right" });
    doc.addImage(
      num.dataUrl,
      "JPEG",
      PAGE_W - MARGIN - 12,
      MARGIN,
      12,
      (12 * num.height) / num.width
    );
    doc.setDrawColor(220);
    doc.line(MARGIN, MARGIN + 7.5, PAGE_W - MARGIN, MARGIN + 7.5);
  };

  /* ── 1단계: 문항을 단(column)에 순서대로 담는다.
     (예전에는 한 단을 위·아래 두 칸으로 나눠 써서 짧은 문항 뒤에 빈 곳이 크게 남았다) */
  const packed = packColumns(blocks.map(blockHeight), {
    workSpace: wantQuestion ? MIN_WORK_SPACE : 0,
    shrinkToFit: !wantQuestion,
  });

  /* ── 2단계: 단마다 남는 자리를 나눠 준다.
     문제지는 문항 아래 풀 공간으로, 해설지는 문항 사이 간격으로 (너무 벌어지지 않게 제한). */
  const draw = (placed: PackedItem, col: number, top: number) => {
    const block = blocks[placed.index];
    const x = MARGIN + col * (COL_W + GUTTER);
    const label = textImage(block.label, 900, {
      size: 22,
      color: "#2C4A82",
      bold: true,
    });
    doc.addImage(
      label.dataUrl,
      "JPEG",
      x,
      top,
      COL_W,
      Math.min(LABEL_H - 0.8, (COL_W * label.height) / label.width)
    );
    let imgY = top + LABEL_H;
    for (const im of block.images) {
      const w = COL_W * placed.shrink;
      const hh = (w * im.height) / im.width;
      doc.addImage(im.dataUrl, "JPEG", x, imgY, w, hh, undefined, "FAST");
      imgY += hh;
    }
  };

  drawHeader();
  packed.forEach((items, index) => {
    const col = index % 2;
    if (index > 0 && col === 0) {
      doc.addPage();
      page += 1;
      drawHeader();
    }

    const extra = spacingFor(items, wantQuestion);

    let y = CONTENT_TOP;
    items.forEach((p, i) => {
      draw(p, col, y);
      y += p.height + extra;
      if (i < items.length - 1) y += ITEM_GAP;
    });
  });

  const name = `오답${kindLabel}_${opts.subject}_${opts.studentName}.pdf`;
  doc.save(name);
  return { pages: page, included: blocks.length, skipped };
}
