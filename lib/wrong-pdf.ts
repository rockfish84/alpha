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
/** 문제지는 한 단에 두 문항까지 (= A4 한 장에 네 문항). 남는 자리는 풀 공간이 된다. */
const QUESTION_PER_COLUMN = 2;
/**
 * 오답 PDF 문항 이미지 품질.
 * 2단 폭(약 92mm)에 1440px이면 약 400dpi라 원본의 가는 수식도 인쇄 시 선명하다.
 */
const EXPORT_IMAGE_WIDTH = 1440;
const EXPORT_MAX_SCALE = 6;

/** 가로로 넓적한 문항은 한 단(가로 전체)으로 써야 종이를 꽉 채운다 */
const WIDE_ASPECT = 1.45;
const CONTENT_TOP = MARGIN + HEADER_H;
const CONTENT_H = PAGE_H - CONTENT_TOP - MARGIN;

/** 단 수에 따른 단 너비 (mm) */
const colWidth = (columns: number) =>
  (PAGE_W - MARGIN * 2 - GUTTER * (columns - 1)) / columns;

const COL_W = colWidth(2);

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

/**
 * 이미지를 칸 안에 넣을 때의 크기 (mm). 가로세로 비를 그대로 지킨다.
 * 칸 너비에 억지로 맞추면 글자가 눌려 보이므로 반드시 이 계산을 쓴다.
 */
export function fitBox(
  imgW: number,
  imgH: number,
  maxW: number,
  maxH: number
): { w: number; h: number } {
  if (imgW <= 0 || imgH <= 0) return { w: 0, h: 0 };
  const scale = Math.min(maxW / imgW, maxH / imgH);
  return { w: imgW * scale, h: imgH * scale };
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
  opts: {
    contentH?: number;
    workSpace?: number;
    shrinkToFit?: boolean;
    /** 한 단에 넣을 문항 수 상한 (문제지는 풀 공간을 남기려고 제한한다) */
    maxPerColumn?: number;
  } = {}
): PackedItem[][] {
  const contentH = opts.contentH ?? CONTENT_H;
  const workSpace = opts.workSpace ?? 0;
  const maxPerColumn = opts.maxPerColumn ?? Infinity;
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
    if (cur.length >= maxPerColumn) flush();
    const gap = cur.length ? ITEM_GAP : 0;
    const room = contentH - used - gap;

    if (natural + workSpace <= room) {
      cur.push({ index, height: natural, shrink: 1 });
      used += gap + natural + workSpace;
      return;
    }
    // 풀 공간까지는 못 넣어도 문항 자체가 들어가면 넣는다 (그만큼 종이를 더 쓴다)
    if (natural <= room) {
      cur.push({ index, height: natural, shrink: 1 });
      used += gap + natural;
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
function blockHeight(block: Block, colW: number = COL_W): number {
  const imgs = block.images.reduce((a, im) => a + (colW * im.height) / im.width, 0);
  return LABEL_H + imgs;
}

/** 문항들의 가로세로 비를 보고 단 수를 정한다 (넓적하면 1단, 길쭉하면 2단). */
export function columnCountFor(blocks: { images: Img[] }[]): number {
  const ratios: number[] = [];
  for (const b of blocks) {
    const first = b.images[0];
    if (!first?.width) continue;
    // 여러 조각이면 같은 폭으로 이어 붙였을 때의 전체 높이로 본다
    const height = b.images.reduce(
      (a, im) => a + (first.width * im.height) / im.width,
      0
    );
    if (height > 0) ratios.push(first.width / height);
  }
  if (!ratios.length) return 2;
  ratios.sort((a, b) => a - b);
  return ratios[Math.floor(ratios.length / 2)] >= WIDE_ASPECT ? 1 : 2;
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
        // 문항 둘레의 빈 여백을 잘라내야 종이가 꽉 찬다
        images: await renderRegionImages(source.fileId, source.rects, EXPORT_IMAGE_WIDTH, {
          trim: true,
          format: "png",
          maxScale: EXPORT_MAX_SCALE,
        }),
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
    const titleBox = fitBox(title.width, title.height, PAGE_W - MARGIN * 2 - 14, HEADER_H / 2);
    doc.addImage(title.dataUrl, "JPEG", MARGIN, MARGIN, titleBox.w, titleBox.h);
    const num = textImage(String(page), 120, { size: 24, color: "#93A0B4", align: "right" });
    const numBox = fitBox(num.width, num.height, 12, HEADER_H / 2);
    doc.addImage(
      num.dataUrl,
      "JPEG",
      PAGE_W - MARGIN - numBox.w,
      MARGIN,
      numBox.w,
      numBox.h
    );
    doc.setDrawColor(220);
    doc.line(MARGIN, MARGIN + 7.5, PAGE_W - MARGIN, MARGIN + 7.5);
  };

  /* ── 1단계: 문항을 단(column)에 순서대로 담는다.
     (예전에는 한 단을 위·아래 두 칸으로 나눠 써서 짧은 문항 뒤에 빈 곳이 크게 남았다) */
  // 넓적한 문항(해설 카드 등)은 가로 전체를 쓰는 1단이 종이를 더 꽉 채운다.
  const columnCount = columnCountFor(blocks);
  const colW = colWidth(columnCount);

  const packed = packColumns(
    blocks.map((b) => blockHeight(b, colW)),
    {
      // 문제지는 한 단에 두 문항까지만 넣고 나머지 자리를 풀 공간으로 준다.
      maxPerColumn: wantQuestion ? QUESTION_PER_COLUMN : undefined,
      shrinkToFit: !wantQuestion,
    }
  );

  /* ── 2단계: 단마다 남는 자리를 나눠 준다.
     문제지는 문항 아래 풀 공간으로, 해설지는 문항 사이 간격으로 (너무 벌어지지 않게 제한). */
  const draw = (placed: PackedItem, col: number, top: number) => {
    const block = blocks[placed.index];
    const x = MARGIN + col * (colW + GUTTER);
    const label = textImage(block.label, 900, {
      size: 22,
      color: "#2C4A82",
      bold: true,
    });
    // 가로세로 비를 그대로 지킨다 (칸 너비에 늘리면 글자가 눌려 보인다)
    const box = fitBox(label.width, label.height, colW, LABEL_H - 0.8);
    doc.addImage(label.dataUrl, "JPEG", x, top, box.w, box.h);
    let imgY = top + LABEL_H;
    for (const im of block.images) {
      const w = colW * placed.shrink;
      const hh = (w * im.height) / im.width;
      // 문항 이미지는 무손실 PNG. 데이터 URL에 맞는 형식을 지정해야 jsPDF가
      // JPEG로 잘못 해석하거나 재압축하지 않는다.
      const format = im.dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
      doc.addImage(im.dataUrl, format, x, imgY, w, hh, undefined, "FAST");
      imgY += hh;
    }
  };

  drawHeader();
  packed.forEach((items, index) => {
    const col = index % columnCount;
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
