// 오답 노트에서 고른 문항만 모아 A4 PDF 로 만든다.
// 시험지처럼 2단으로 채우고, 잘린 이미지가 없도록 칸에 맞춰 넣는다.
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
  let col = 0;
  let y = CONTENT_TOP;
  /** 문제지에서 한 단을 위·아래 두 칸으로 나눠 쓴다 (아래 여백 = 푸는 공간) */
  let slot = 0;
  const SLOT_H = CONTENT_H / 2;

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

  drawHeader();

  const nextColumn = () => {
    if (col === 0) {
      col = 1;
    } else {
      doc.addPage();
      page += 1;
      col = 0;
      drawHeader();
    }
    y = CONTENT_TOP;
    slot = 0;
  };

  /** 한 블록을 그린다. 문제지는 칸(위/아래)에 맞춰, 해설지는 이어서 채운다. */
  const place = (block: Block) => {
    const natural = blockHeight(block);

    if (wantQuestion) {
      // 반 칸에 들어가면 반 칸, 아니면 한 단 전체를 쓴다
      const fitsHalf = natural <= SLOT_H - ITEM_GAP;
      const need = fitsHalf ? SLOT_H : CONTENT_H;
      if (!fitsHalf && slot !== 0) nextColumn();
      if (y + need > CONTENT_TOP + CONTENT_H + 0.5) nextColumn();

      const shrink =
        natural > need - ITEM_GAP
          ? (need - ITEM_GAP - LABEL_H) / (natural - LABEL_H)
          : 1;
      draw(block, y, shrink);
      if (fitsHalf) {
        slot += 1;
        y = CONTENT_TOP + slot * SLOT_H;
        if (slot >= 2) nextColumn();
      } else {
        nextColumn();
      }
      return;
    }

    // 해설지: 빈칸 없이 이어서
    let h = natural;
    let shrink = 1;
    if (h > CONTENT_H) {
      shrink = (CONTENT_H - LABEL_H) / (h - LABEL_H);
      h = CONTENT_H;
    }
    if (y + h > CONTENT_TOP + CONTENT_H) nextColumn();
    draw(block, y, shrink);
    y += h + ITEM_GAP;
  };

  function draw(block: Block, top: number, shrink: number) {
    const x = MARGIN + col * (COL_W + GUTTER);
    const label = textImage(block.label, 900, { size: 22, color: "#2C4A82", bold: true });
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
      const w = COL_W * shrink;
      const hh = (w * im.height) / im.width;
      doc.addImage(im.dataUrl, "JPEG", x, imgY, w, hh, undefined, "FAST");
      imgY += hh;
    }
  }

  for (const b of blocks) place(b);

  const name = `오답${kindLabel}_${opts.subject}_${opts.studentName}.pdf`;
  doc.save(name);
  return { pages: page, included: blocks.length, skipped };
}
