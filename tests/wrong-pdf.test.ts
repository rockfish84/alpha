import test from "node:test";
import assert from "node:assert/strict";
import { columnCountFor, fitBox, packColumns, spacingFor } from "../lib/wrong-pdf";

/** A4 한 단에 쓸 수 있는 세로 길이 (mm) — lib/wrong-pdf.ts 와 같은 값 */
const CONTENT_H = 297 - (10 + 12) - 10;
const ITEM_GAP = 5;

/** 채워진 정도(%) — 마지막 단은 원래 덜 차므로 뺀다 */
const fill = (cols: { height: number }[][]) => {
  const full = cols.length > 1 ? cols.slice(0, -1) : cols;
  return Math.round(
    (full.reduce((a, c) => a + c.reduce((b, p) => b + p.height, 0), 0) /
      (full.length * CONTENT_H)) *
      100
  );
};

test("짧은 문항이 이어지면 한 단에 여러 개가 들어간다", () => {
  // 예전에는 한 단을 반씩 나눠 써서 짧은 문항도 두 개까지만 들어갔다
  const cols = packColumns(Array(9).fill(60));
  assert.ok(cols[0].length >= 4, `한 단에 ${cols[0].length}개만 들어갔다`);
  assert.ok(fill(cols) >= 85, `채움 ${fill(cols)}%`);
});

test("문제지는 문항마다 풀 공간을 확보한다", () => {
  const plain = packColumns(Array(9).fill(60));
  const withSpace = packColumns(Array(9).fill(60), {
    workSpace: 10,
    shrinkToFit: false,
  });
  assert.ok(
    withSpace[0].length < plain[0].length,
    "풀 공간을 잡으면 한 단에 들어가는 문항이 줄어야 한다"
  );
  // 남는 자리는 전부 문항 아래 풀 공간으로 나눠 준다
  const extra = spacingFor(withSpace[0], true);
  assert.ok(extra >= 10, `풀 공간이 ${extra.toFixed(1)}mm 뿐이다`);
});

test("남은 자리가 제법 되면 조금 줄여서 그 단을 끝까지 채운다", () => {
  // 100 + 100 = 200, 남은 자리 60 에 자연 높이 80 짜리를 줄여 넣는다
  const cols = packColumns([100, 100, 80]);
  assert.equal(cols.length, 1, "세 번째 문항이 다음 단으로 넘어갔다");
  const last = cols[0][2];
  assert.ok(last.shrink < 1 && last.shrink > 0.6, `축소 비율 ${last.shrink}`);
  assert.ok(fill(cols) >= 95, `채움 ${fill(cols)}%`);
});

test("문제지는 줄이지 않고 다음 단으로 넘긴다 (남는 자리 = 풀 공간)", () => {
  const cols = packColumns([100, 100, 80], { workSpace: 10, shrinkToFit: false });
  assert.equal(cols.length, 2);
  assert.equal(cols[0].length, 2);
  assert.ok(cols.flat().every((p) => p.shrink === 1), "문제지는 원래 크기로 그린다");
});

test("너무 많이 줄여야 하면 다음 단으로 넘긴다", () => {
  // 남은 자리 20 에 100 짜리를 넣으면 5분의 1로 줄어든다 → 넘긴다
  const cols = packColumns([120, 120, 100]);
  assert.equal(cols.length, 2);
  assert.equal(cols[1][0].shrink, 1, "넘긴 문항은 원래 크기로 그린다");
});

test("한 단보다 큰 문항은 한 단 크기에 맞춰 줄인다", () => {
  const cols = packColumns([400]);
  assert.equal(cols.length, 1);
  assert.equal(cols[0][0].height, CONTENT_H);
  assert.ok(cols[0][0].shrink < 1);
});

test("해설지는 문항 사이가 과하게 벌어지지 않는다", () => {
  const cols = packColumns([50]);
  assert.ok(spacingFor(cols[0], false) <= 18, "해설지 간격 제한");
  // 문제지는 같은 상황에서 남는 자리를 모두 풀 공간으로 쓴다
  assert.ok(spacingFor(cols[0], true) > 100);
});

test("문항 순서는 바뀌지 않는다", () => {
  const cols = packColumns([60, 200, 60, 60, 300, 60], {
    workSpace: 10,
    shrinkToFit: false,
  });
  const order = cols.flat().map((p) => p.index);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.equal(order.length, 6, "빠진 문항이 있으면 안 된다");
});

test("한 단 간격은 문항 사이에만 들어간다", () => {
  const cols = packColumns([CONTENT_H - ITEM_GAP - 50, 50]);
  assert.equal(cols.length, 1, "딱 맞는 두 문항은 한 단에 들어가야 한다");
});

test("문제지는 한 단에 두 문항까지만 넣는다 (= A4 한 장에 네 문항)", () => {
  // 짧은 문항이어도 빽빽하게 넣지 않고, 남는 자리를 풀 공간으로 준다
  const cols = packColumns(Array(8).fill(40), { maxPerColumn: 2 });
  assert.ok(
    cols.every((c) => c.length <= 2),
    "한 단에 세 문항 이상 들어갔다"
  );
  assert.equal(cols.length, 4, "8문항 → 4단 (= 2장)");
  assert.ok(spacingFor(cols[0], true) > 80, "풀 공간이 넉넉해야 한다");
});

test("문제지에서 큰 문항 두 개가 한 단에 들어간다", () => {
  // A4 한 단(265mm)에 120mm 문항 두 개 → 한 장에 네 문항
  const cols = packColumns([120, 120, 120, 120], { maxPerColumn: 2 });
  assert.equal(cols.length, 2);
  assert.deepEqual(cols.map((c) => c.length), [2, 2]);
});

test("넓적한 문항은 가로 전체(1단), 길쭉한 문항은 2단으로 배치한다", () => {
  const img = (width: number, height: number) => ({
    images: [{ dataUrl: "", width, height }],
  });
  // 해설 카드 (문제+풀이가 좌우로 붙어 넓적하다)
  assert.equal(columnCountFor([img(521, 230), img(521, 240)]), 1);
  // 문제 카드 (세로로 길다)
  assert.equal(columnCountFor([img(256, 322), img(256, 300)]), 2);
  // 이미지가 없으면 기본 2단
  assert.equal(columnCountFor([]), 2);
});

test("글자·이미지는 칸에 넣어도 가로세로 비가 그대로다", () => {
  // 900×33 짜리 라벨을 190mm 칸에 넣을 때, 높이 제한(4.4mm)에 맞춰 줄어야 한다.
  const box = fitBox(900, 33, 190, 4.4);
  assert.equal(Math.round(box.h * 10) / 10, 4.4);
  // 비율 유지: 원본 비(27.3)와 같아야 한다 (예전에는 칸 너비 190mm 로 늘려 글자가 눌렸다)
  assert.ok(Math.abs(box.w / box.h - 900 / 33) < 0.01, `비율이 ${box.w / box.h}`);
  assert.ok(box.w <= 190);

  // 칸보다 가로가 긴 경우엔 가로에 맞춰 줄인다
  const wide = fitBox(2000, 100, 190, 20);
  assert.equal(Math.round(wide.w), 190);
  assert.ok(Math.abs(wide.w / wide.h - 20) < 0.01);

  assert.deepEqual(fitBox(0, 10, 100, 100), { w: 0, h: 0 });
});
