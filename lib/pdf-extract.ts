// 업로드한 시험지·해설지 PDF에서 "문항별 위치"를 찾아낸다. (브라우저 전용)
//
// 학원 PDF는 jsPDF 로 만든 이미지 페이지라 텍스트 레이어가 없다. 그래서 페이지를
// 그려서 여백(빈 줄)을 분석해 문항 블록을 나눈다. 저장하는 것은 좌표뿐이라
// DB 용량을 거의 쓰지 않는다.
import type { QuestionRegion, RegionRect } from "./analysis-types";

const INK_LUMA = 205; // 이보다 어두우면 잉크로 본다
// 카드(문항 상자) 테두리는 아주 연한 회색이라 잉크 기준으로는 안 잡힌다. 따로 본다.
const BOX_LUMA = 245;
const CARD_SIDE_RATIO = 0.12; // 이 비율(페이지 높이) 이상 이어져야 카드 옆 테두리로 본다
const CARD_MIN_W = 0.14; // 카드 최소 가로 (페이지 폭 대비)
const CARD_MIN_H = 0.10; // 카드 최소 세로 (페이지 높이 대비)
const HEADER_BAND = 0.35; // 머리말 띠를 찾는 범위 (위쪽 이 비율 안)
const HEADER_FILL = 0.6; // 가로로 이만큼 채운 행이면 머리말 띠로 본다
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
  /** 문항 상자(카드) 시험지면 카드 목록. 이때는 카드 하나 = 문항 하나다. */
  cards?: DetectedCard[];
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

/** 문항 상자 하나. 읽는 순서(왼→오, 위→아래)로 돌려준다. */
export interface DetectedCard {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 머리말 띠(가로로 꽉 찬 행)의 아래 끝. 없으면 위쪽 5% 지점. */
function headerBottom(data: Uint8ClampedArray, w: number, h: number): number {
  let last = -1;
  const limit = Math.floor(h * HEADER_BAND);
  for (let y = 0; y < limit; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (luma(data, (y * w + x) * 4) < INK_LUMA) n++;
    if (n > w * HEADER_FILL) last = y;
  }
  return last >= 0 ? last + 4 : Math.round(h * 0.05);
}

/**
 * 문항이 "상자(카드)" 하나에 하나씩 들어 있는 시험지를 인식한다.
 *
 * 카드의 좌·우 테두리는 위아래 테두리를 잇는 긴 세로선이다. 그 세로선의 위·아래 끝이
 * 곧 카드의 높이이므로, 같은 높이를 가진 세로선끼리 짝지으면 카드가 된다.
 * 카드 안쪽 구분선(해설지의 문제/풀이 가름선)은 테두리까지 닿지 않으므로 자연히 걸러진다.
 */
function detectCards(
  data: Uint8ClampedArray,
  w: number,
  h: number
): DetectedCard[] {
  const y0 = headerBottom(data, w, h);
  const minLen = h * CARD_SIDE_RATIO;

  // 1) 길게 이어지는 세로선을 찾아 (x, 위, 아래) 로 모은다
  type Seg = { x: number; top: number; bottom: number };
  const segs: Seg[] = [];
  for (let x = 0; x < w; x++) {
    let start = -1;
    for (let y = y0; y <= h; y++) {
      const on = y < h && luma(data, (y * w + x) * 4) < BOX_LUMA;
      if (on && start < 0) start = y;
      else if (!on && start >= 0) {
        if (y - start >= minLen) segs.push({ x, top: start, bottom: y - 1 });
        start = -1;
      }
    }
  }
  if (segs.length < 2) return [];

  // 2) 위·아래 끝이 같은 세로선끼리 묶으면 한 줄(카드 행)이 된다
  const rows: { top: number; bottom: number; xs: number[] }[] = [];
  for (const seg of segs) {
    const row = rows.find(
      (r) => Math.abs(r.top - seg.top) <= 4 && Math.abs(r.bottom - seg.bottom) <= 4
    );
    if (row) row.xs.push(seg.x);
    else rows.push({ top: seg.top, bottom: seg.bottom, xs: [seg.x] });
  }

  // 3) 붙어 있는 x 는 한 선으로 합치고, 좌우 짝을 지어 카드로 만든다
  const cards: DetectedCard[] = [];
  for (const row of rows) {
    const sorted = [...new Set(row.xs)].sort((a, b) => a - b);
    const lines: number[] = [];
    let group = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - group[group.length - 1] <= 3) group.push(sorted[i]);
      else {
        lines.push(Math.round(group.reduce((a, v) => a + v, 0) / group.length));
        group = [sorted[i]];
      }
    }
    lines.push(Math.round(group.reduce((a, v) => a + v, 0) / group.length));
    if (lines.length < 2 || lines.length % 2) continue; // 짝이 안 맞으면 카드가 아니다

    for (let i = 0; i < lines.length; i += 2) {
      const x = lines[i];
      const right = lines[i + 1];
      const card = { x, y: row.top, w: right - x, h: row.bottom - row.top };
      if (card.w >= w * CARD_MIN_W && card.h >= h * CARD_MIN_H) cards.push(card);
    }
  }

  // 4) 읽는 순서: 위 줄부터, 같은 줄에서는 왼쪽부터
  return cards.sort((a, b) => (Math.abs(a.y - b.y) > 6 ? a.y - b.y : a.x - b.x));
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

    // 문항이 상자 하나에 하나씩 들어 있는 시험지면 상자를 그대로 문항으로 쓴다.
    const cards = detectCards(px, w, h);

    pages.push({
      page: p,
      width: w,
      height: h,
      cards: cards.length ? cards : undefined,
      canvas: opts.keepCanvas ? canvas : undefined,
      columns: cards.length
        ? // 카드 한 개 = 블록 한 개 (읽는 순서 그대로)
          [
            {
              x0: 0,
              x1: w,
              blocks: cards.map((c) => ({
                top: c.y,
                bottom: c.y + c.h,
                left: c.x,
                right: c.x + c.w,
                gapAfter: 0,
                looksLikeStart: true,
              })),
            },
          ]
        : bands.map(([x0, x1]) => ({
            x0,
            x1,
            blocks: blocksInColumn(px, w, x0, x1, y0, y1, MIN_GAP_PT),
          })),
    });
  }

  await doc.destroy?.();
  return pages;
}

/** 문항 상자(카드)로 인식된 시험지인지. */
export function hasCards(pages: DetectedPage[]): boolean {
  return pages.some((p) => (p.cards?.length ?? 0) > 0);
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
  // 카드형 시험지는 카드 안쪽만 담기므로 머리말이 섞일 일이 없다.
  if (hasCards(pages)) return out;
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

  // 카드형 시험지: 상자 하나가 문항 하나이므로 전부 문항 시작이다.
  if (hasCards(pages)) {
    for (const item of order) starts.add(item.id);
    return starts;
  }

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
  // 카드형 시험지는 상자 좌표가 곧 문항 영역이다.
  if (hasCards(pages)) {
    const rects: GroupRect[] = [];
    let group = 0;
    for (const page of pages) {
      (page.cards ?? []).forEach((c, i) => {
        if (excluded.has(blockId(page.page, 0, i))) return;
        rects.push({
          group: group++,
          col: 0,
          page: page.page,
          x: Math.max(0, c.x - PAD),
          y: Math.max(0, c.y - PAD),
          w: Math.min(page.width, c.w + PAD * 2),
          h: Math.min(page.height, c.h + PAD * 2),
          pw: page.width,
          ph: page.height,
        });
      });
    }
    return rects;
  }

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
