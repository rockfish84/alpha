// 업로드한 시험지·해설지 PDF에서 "문항별 위치"를 찾아낸다. (브라우저 전용)
//
// 학원 PDF는 jsPDF 로 만든 이미지 페이지라 텍스트 레이어가 없다. 그래서 페이지를
// 그려서 여백(빈 줄)을 분석해 문항 블록을 나눈다. 저장하는 것은 좌표뿐이라
// DB 용량을 거의 쓰지 않는다.
import type { QuestionRegion, RegionRect } from "./analysis-types";

const INK_LUMA = 205; // 이보다 어두우면 잉크로 본다
const MIN_GAP_PT = 9; // 이보다 짧은 여백은 줄 간격으로 본다
const MIN_BLOCK_PT = 6;
const FOOTER_RATIO = 0.035; // 바닥글 가로선을 못 찾았을 때 쓰는 최소 여백
const PAD = 4;

let pdfjsPromise: Promise<any> | null = null;

/** pdf.js 를 필요할 때만 불러온다. */
export async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export interface DetectedBlock {
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** 다음 블록까지의 여백 (마지막 블록은 0) */
  gapAfter: number;
  /** 첫 줄이 "큰 숫자 하나"처럼 보이는지 = 문항 번호로 시작하는 블록 */
  looksLikeStart: boolean;
}

export interface DetectedColumn {
  x0: number;
  x1: number;
  blocks: DetectedBlock[];
}

export interface DetectedPage {
  page: number;
  width: number;
  height: number;
  columns: DetectedColumn[];
  canvas?: HTMLCanvasElement;
}

/** 블록 식별자: "페이지:단:블록" */
export type BlockId = string;
export const blockId = (p: number, c: number, i: number): BlockId => `${p}:${c}:${i}`;

function luma(data: Uint8ClampedArray, i: number): number {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

/** 가운데 세로 구분선을 찾아 2단 여부와 본문 세로 범위를 잡는다. */
function findDivider(data: Uint8ClampedArray, w: number, h: number) {
  const from = Math.floor(w * 0.44);
  const to = Math.ceil(w * 0.56);
  let bestX = -1;
  let bestCount = 0;
  for (let x = from; x < to; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) if (luma(data, (y * w + x) * 4) < INK_LUMA) n++;
    if (n > bestCount) {
      bestCount = n;
      bestX = x;
    }
  }
  if (bestCount < h * 0.35) return null; // 구분선 없음 → 1단
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    if (luma(data, (y * w + bestX) * 4) < INK_LUMA) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  return { x: bestX, top, bottom };
}

/**
 * 본문 아래 끝을 찾는다. 학원 시험지는 바닥글(쪽번호) 위에 가로선이 있어서
 * 그 선을 기준으로 자르면 마지막 줄이 잘리지 않는다. 선이 없으면 비율로 자른다.
 */
function findFooterTop(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  fallback: number
): number {
  const from = Math.floor(h * 0.8);
  for (let y = h - 1; y >= from; y--) {
    let n = 0;
    for (let x = 0; x < w; x++) if (luma(data, (y * w + x) * 4) < INK_LUMA) n++;
    if (n > w * 0.6) return y - 2; // 가로선
  }
  return fallback;
}

/** 한 단(column) 안의 잉크 행을 훑어 블록으로 자른다. */
function blocksInColumn(
  data: Uint8ClampedArray,
  w: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  minGap: number
): DetectedBlock[] {
  const out: DetectedBlock[] = [];
  let start = -1;
  let lastInk = -1;
  const rowInk = (y: number) => {
    let n = 0;
    for (let x = x0; x < x1; x++) if (luma(data, (y * w + x) * 4) < INK_LUMA) n++;
    return n;
  };
  for (let y = y0; y < y1; y++) {
    if (rowInk(y) > 1) {
      if (start < 0) start = y;
      lastInk = y;
    } else if (start >= 0 && y - lastInk >= minGap) {
      out.push({
        top: start,
        bottom: lastInk,
        left: x0,
        right: x1,
        gapAfter: 0,
        looksLikeStart: false,
      });
      start = -1;
    }
  }
  if (start >= 0) {
    out.push({
      top: start,
      bottom: lastInk,
      left: x0,
      right: x1,
      gapAfter: 0,
      looksLikeStart: false,
    });
  }

  // 첫 줄이 문항 번호(짧고 큰 숫자)처럼 생겼는지 본다.
  const colWidth = x1 - x0;
  for (const b of out) {
    let lineEnd = b.top;
    let blank = 0;
    for (let y = b.top; y <= b.bottom; y++) {
      let n = 0;
      for (let x = x0; x < x1; x++) if (luma(data, (y * w + x) * 4) < INK_LUMA) n++;
      if (n > 1) {
        lineEnd = y;
        blank = 0;
      } else if (++blank >= 3) {
        break;
      }
    }
    let left = x1;
    let right = x0;
    for (let y = b.top; y <= lineEnd; y++) {
      for (let x = x0; x < x1; x++) {
        if (luma(data, (y * w + x) * 4) < INK_LUMA) {
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    const lineWidth = right - left;
    b.looksLikeStart =
      lineWidth > 0 &&
      lineWidth <= colWidth * 0.12 &&
      left - x0 <= colWidth * 0.12 &&
      lineEnd - b.top >= 8;
  }

  // 블록별 실제 잉크 가로 범위
  for (const b of out) {
    let left = x1;
    let right = x0;
    for (let y = b.top; y <= b.bottom; y++) {
      for (let x = x0; x < x1; x++) {
        if (luma(data, (y * w + x) * 4) < INK_LUMA) {
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    b.left = Math.min(left, x1);
    b.right = Math.max(right, x0);
  }

  const kept = out.filter(
    (b) => b.bottom - b.top >= MIN_BLOCK_PT && b.right > b.left
  );
  for (let i = 0; i < kept.length - 1; i++) {
    kept[i].gapAfter = kept[i + 1].top - kept[i].bottom;
  }
  return kept;
}

/** PDF 전체를 훑어 문항 후보 블록을 찾는다. (canvas 도 함께 돌려줘 미리보기에 쓴다) */
export async function detectBlocks(
  data: ArrayBuffer,
  opts: { keepCanvas?: boolean } = {}
): Promise<DetectedPage[]> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const pages: DetectedPage[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) continue;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    const w = canvas.width;
    const h = canvas.height;
    const { data: px } = ctx.getImageData(0, 0, w, h);
    const divider = findDivider(px, w, h);
    const y0 = divider ? divider.top : Math.round(h * 0.07);
    const bottomLimit = divider ? divider.bottom : Math.round(h * 0.95);
    const y1 = Math.min(
      bottomLimit,
      findFooterTop(px, w, h, bottomLimit - Math.round(h * FOOTER_RATIO))
    );
    const bands: [number, number][] = divider
      ? [
          [0, divider.x - 4],
          [divider.x + 4, w],
        ]
      : [[0, w]];

    pages.push({
      page: p,
      width: w,
      height: h,
      canvas: opts.keepCanvas ? canvas : undefined,
      columns: bands.map(([x0, x1]) => ({
        x0,
        x1,
        blocks: blocksInColumn(px, w, x0, x1, y0, y1, MIN_GAP_PT),
      })),
    });
  }

  await doc.destroy?.();
  return pages;
}

/** 읽는 순서(페이지 → 왼쪽 단 → 오른쪽 단 → 위에서 아래)로 늘어놓은 블록. */
export function readingOrder(pages: DetectedPage[]) {
  const list: {
    id: BlockId;
    page: number;
    col: number;
    index: number;
    block: DetectedBlock;
  }[] = [];
  for (const p of pages) {
    p.columns.forEach((col, ci) => {
      col.blocks.forEach((block, i) => {
        list.push({ id: blockId(p.page, ci, i), page: p.page, col: ci, index: i, block });
      });
    });
  }
  return list;
}

/** 머리말로 보는 세로 범위 (페이지 위쪽 이 비율 안쪽만 머리말 후보) */
const HEADER_MAX_RATIO = 0.3;

/**
 * 머리말(시험지 제목·학원 로고·날짜/출제자 칸)을 자동으로 골라낸다.
 *
 * 문항은 왼쪽에 번호가 오는 블록에서 시작한다. 그래서 "그 단에서 첫 번호 블록보다
 * 위에 있는" 블록은 문항이 아니라 머리말이다. 이어지는 페이지 위쪽은 앞 문항이
 * 넘어온 것일 수 있으므로 1쪽에서만 본다.
 */
export function autoExcludeBlocks(pages: DetectedPage[]): Set<BlockId> {
  const out = new Set<BlockId>();
  const first = pages[0];
  if (!first) return out;
  first.columns.forEach((col, ci) => {
    const firstNumbered = col.blocks.findIndex((b) => b.looksLikeStart);
    // 번호 블록을 아예 못 찾은 단은 건드리지 않는다 (잘못 지우는 것보다 낫다)
    if (firstNumbered <= 0) return;
    for (let i = 0; i < firstNumbered; i++) {
      const b = col.blocks[i];
      if (b.bottom > first.height * HEADER_MAX_RATIO) break;
      out.add(blockId(first.page, ci, i));
    }
  });
  return out;
}

/**
 * 문항 시작 위치 자동 선택.
 * 단(column)의 첫 블록은 새 문항일 가능성이 높으므로 먼저 고르고,
 * 모자라는 만큼 여백이 큰 순서대로 채운다.
 */
export function autoSelectStarts(
  pages: DetectedPage[],
  expected: number,
  excluded: Set<BlockId> = new Set()
): Set<BlockId> {
  const order = readingOrder(pages).filter((item) => !excluded.has(item.id));
  if (!order.length) return new Set();
  const starts = new Set<BlockId>();

  // 1순위: 첫 줄이 문항 번호처럼 생긴 블록
  const marked = order.filter((item) => item.block.looksLikeStart);
  for (const item of marked) {
    if (starts.size >= expected) break;
    starts.add(item.id);
  }

  // 번호를 못 찾았으면(스캔 화질 등) 각 단의 첫 블록을 문항 시작으로 본다.
  if (!marked.length) {
    const seen = new Set<string>();
    for (const item of order) {
      const key = `${item.page}:${item.col}`;
      if (seen.has(key)) continue;
      seen.add(key);
      starts.add(item.id);
    }
  }

  // 그래도 모자라면 여백이 큰 순서대로 채운다.
  if (starts.size < expected) {
    const gaps = order
      .filter((item) => item.index > 0 && !starts.has(item.id))
      .filter((item) => !excluded.has(item.id))
      .map((item) => ({
        id: item.id,
        gap:
          pages.find((p) => p.page === item.page)!.columns[item.col].blocks[
            item.index - 1
          ].gapAfter,
      }))
      .sort((a, b) => b.gap - a.gap);
    for (const g of gaps) {
      if (starts.size >= expected) break;
      starts.add(g.id);
    }
  }

  // 제외하지 않은 첫 블록은 언제나 첫 문항의 시작이다.
  starts.add(order[0].id);
  return starts;
}

/**
 * 선택된 시작 위치로 문항별 영역을 계산한다.
 * 한 문항의 영역은 "그 문항이 시작하는 곳 ~ 다음 문항이 시작하기 직전"까지라서
 * 마지막 줄이나 보기 ⑤ 가 잘려 나가지 않는다.
 */
export interface GroupRect extends RegionRect {
  group: number; // 몇 번째 문항인지 (0부터)
  col: number;
}

export function regionRectsFor(
  pages: DetectedPage[],
  starts: Set<BlockId>,
  excluded: Set<BlockId> = new Set()
): GroupRect[] {
  const order = readingOrder(pages).filter((item) => !excluded.has(item.id));
  if (!order.length) return [];

  // 블록 → 몇 번째 문항 (제외한 블록은 어느 문항에도 넣지 않는다)
  const groupOf = new Map<BlockId, number>();
  let g = -1;
  for (const item of order) {
    if (starts.has(item.id) || g < 0) g += 1;
    groupOf.set(item.id, g);
  }

  const rects: GroupRect[] = [];
  for (const page of pages) {
    page.columns.forEach((col, ci) => {
      // 제외한 블록(머리말 등)은 없는 셈 치고 묶는다.
      const blocks = col.blocks.filter(
        (_, i) => !excluded.has(blockId(page.page, ci, i))
      );
      const indexOf = col.blocks
        .map((_, i) => i)
        .filter((i) => !excluded.has(blockId(page.page, ci, i)));
      if (!blocks.length) return;
      // 단 전체의 잉크 가로 범위 (문항마다 폭이 들쭉날쭉하지 않도록 통일)
      const left = Math.max(0, Math.min(...blocks.map((b) => b.left)) - PAD * 2);
      const right = Math.min(
        page.width,
        Math.max(...blocks.map((b) => b.right)) + PAD * 2
      );
      const colBottom = Math.max(...blocks.map((b) => b.bottom)) + PAD;

      let runStart = 0;
      for (let i = 0; i <= blocks.length; i++) {
        const cur =
          i < blocks.length ? groupOf.get(blockId(page.page, ci, indexOf[i])) : null;
        const prev = groupOf.get(blockId(page.page, ci, indexOf[runStart]));
        const ended = i === blocks.length || cur !== prev;
        if (!ended) continue;

        const top = Math.max(0, blocks[runStart].top - PAD);
        // 이 문항에 속한 마지막 잉크까지 담되, 다음 문항 시작은 넘지 않는다.
        // (마지막 보기 ⑤ 가 잘리지 않으면서 빈 여백은 과하게 담지 않도록)
        const inkBottom = blocks[i - 1]?.bottom ?? blocks[runStart].bottom;
        const limit =
          i < blocks.length ? blocks[i].top - 2 : Math.min(page.height, colBottom);
        const bottom = Math.max(top + 10, Math.min(inkBottom + PAD * 2, limit));
        rects.push({
          group: prev ?? 0,
          col: ci,
          page: page.page,
          x: left,
          y: top,
          w: right - left,
          h: bottom - top,
          pw: page.width,
          ph: page.height,
        });
        runStart = i;
      }
    });
  }
  return rects;
}

/** 선택된 시작 위치로 문항 영역(QuestionRegion)을 만든다. */
export function buildRegions(
  pages: DetectedPage[],
  starts: Set<BlockId>,
  numbers: number[],
  kind: "paper" | "solution",
  fileId: string,
  excluded: Set<BlockId> = new Set()
): QuestionRegion[] {
  const rects = regionRectsFor(pages, starts, excluded);
  const byGroup = new Map<number, RegionRect[]>();
  for (const r of rects) {
    const { group, col, ...rect } = r;
    byGroup.set(group, [...(byGroup.get(group) ?? []), rect]);
  }

  const regions: QuestionRegion[] = [];
  for (const [group, list] of [...byGroup.entries()].sort((a, b) => a[0] - b[0])) {
    const no = numbers[group];
    if (!no || !list.length) continue;
    regions.push({ no, kind, fileId, rects: list });
  }
  return regions;
}
