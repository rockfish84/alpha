import test from "node:test";
import assert from "node:assert/strict";
import {
  autoExcludeBlocks,
  autoSelectStarts,
  blockId,
  buildRegions,
  regionRectsFor,
  type DetectedBlock,
  type DetectedPage,
} from "../lib/pdf-extract";

/** 블록 하나 (top/bottom 만 중요하고 나머지는 기본값) */
const block = (
  top: number,
  bottom: number,
  looksLikeStart: boolean,
  left = 40,
  right = 400
): DetectedBlock => ({ top, bottom, left, right, gapAfter: 0, looksLikeStart });

/**
 * 학원 시험지 1쪽 모양.
 *   왼쪽 단: [머리말(제목·날짜칸)] [1번] [2번]
 *   오른쪽 단: [학원 로고] [3번] [4번]
 * 머리말과 로고에는 문항 번호가 없다.
 */
const samplePage = (): DetectedPage => ({
  page: 1,
  width: 840,
  height: 1188, // A4 비율
  columns: [
    {
      x0: 0,
      x1: 416,
      blocks: [
        block(60, 150, false), // 머리말 (페이지 높이의 13% 지점까지)
        block(300, 600, true), // 1번
        block(640, 900, true), // 2번
      ],
    },
    {
      x0: 424,
      x1: 840,
      blocks: [
        block(60, 140, false, 460, 800), // 학원 로고
        block(300, 560, true, 460, 800), // 3번
        block(600, 880, true, 460, 800), // 4번
      ],
    },
  ],
});

test("머리말·로고 블록은 문항 영역에서 자동으로 빠진다", () => {
  const pages = [samplePage()];
  const excluded = autoExcludeBlocks(pages);

  assert.ok(excluded.has(blockId(1, 0, 0)), "왼쪽 단 머리말이 제외되어야 한다");
  assert.ok(excluded.has(blockId(1, 1, 0)), "오른쪽 단 로고가 제외되어야 한다");
  assert.equal(excluded.size, 2, "문항 블록은 하나도 제외되면 안 된다");
});

test("문항 시작은 번호가 있는 블록으로 잡고, 머리말을 1번으로 잡지 않는다", () => {
  const pages = [samplePage()];
  const excluded = autoExcludeBlocks(pages);
  const starts = autoSelectStarts(pages, 4, excluded);

  assert.equal(starts.size, 4);
  for (const id of [blockId(1, 0, 1), blockId(1, 0, 2), blockId(1, 1, 1), blockId(1, 1, 2)]) {
    assert.ok(starts.has(id), `${id} 가 문항 시작이어야 한다`);
  }
  assert.equal(starts.has(blockId(1, 0, 0)), false, "머리말은 문항 시작이 아니다");
});

test("저장되는 영역에 머리말이 섞이지 않는다", () => {
  const pages = [samplePage()];
  const excluded = autoExcludeBlocks(pages);
  const starts = autoSelectStarts(pages, 4, excluded);
  const rects = regionRectsFor(pages, starts, excluded);

  // 문항 4개 → 4묶음
  assert.deepEqual([...new Set(rects.map((r) => r.group))].sort(), [0, 1, 2, 3]);
  // 머리말이 있던 위쪽(y < 300)을 건드리는 영역이 없어야 한다
  for (const r of rects) {
    assert.ok(r.y >= 290, `영역이 머리말까지 올라갔다 (y=${r.y})`);
  }

  const regions = buildRegions(pages, starts, [1, 2, 3, 4], "paper", "f1", excluded);
  assert.deepEqual(regions.map((r) => r.no), [1, 2, 3, 4]);
});

test("블록을 직접 삭제하면 그 블록은 어느 문항에도 들어가지 않는다", () => {
  const pages = [samplePage()];
  const auto = autoExcludeBlocks(pages);
  // 2번 문항 블록까지 사용자가 삭제한 경우
  const excluded = new Set([...auto, blockId(1, 0, 2)]);
  const starts = autoSelectStarts(pages, 3, excluded);
  const rects = regionRectsFor(pages, starts, excluded);

  assert.equal(starts.has(blockId(1, 0, 2)), false);
  // 남은 문항은 3개, 삭제한 블록 자리(640~900)를 덮는 영역이 없어야 한다
  assert.deepEqual([...new Set(rects.map((r) => r.group))].sort(), [0, 1, 2]);
  for (const r of rects.filter((x) => x.col === 0)) {
    assert.ok(r.y + r.h <= 640, `삭제한 블록까지 영역에 담겼다 (y=${r.y}, h=${r.h})`);
  }
});

test("번호를 못 찾은 단은 건드리지 않는다 (잘못 지우지 않는다)", () => {
  const pages: DetectedPage[] = [
    {
      page: 1,
      width: 840,
      height: 1188,
      columns: [
        { x0: 0, x1: 416, blocks: [block(60, 150, false), block(300, 600, false)] },
      ],
    },
  ];
  assert.equal(autoExcludeBlocks(pages).size, 0);
});

test("머리말은 1쪽에만 있다 — 2쪽부터는 아무 블록도 빼지 않는다", () => {
  const second: DetectedPage = {
    page: 2,
    width: 840,
    height: 1188,
    columns: [
      {
        x0: 0,
        x1: 416,
        blocks: [
          // 2쪽 맨 위는 앞 문항이 넘어온 부분이라 번호가 없다 → 지우면 안 된다
          block(60, 240, false),
          block(300, 620, true),
        ],
      },
    ],
  };
  const pages = [samplePage(), second];
  const excluded = autoExcludeBlocks(pages);

  assert.equal(excluded.size, 2, "1쪽 머리말 2개만 빠져야 한다");
  for (const id of [...excluded]) {
    assert.ok(id.startsWith("1:"), `1쪽 블록만 제외되어야 한다 (${id})`);
  }
  assert.equal(excluded.has(blockId(2, 0, 0)), false);

  // 2쪽 위쪽 블록은 시작을 끄면 앞 문항에 그대로 이어 붙는다
  const starts = autoSelectStarts(pages, 5, excluded);
  starts.delete(blockId(2, 0, 0));
  const rects = regionRectsFor(pages, starts, excluded);
  const carried = rects.find((r) => r.page === 2 && r.y < 300);
  assert.ok(carried, "2쪽 위쪽 내용이 영역에 담겨야 한다");
});
