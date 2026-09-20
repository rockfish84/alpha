// A4 한 장에 반쪽 크기 답지 2장을 만드는 PDF 생성기.
// 원본 HTML은 브라우저에서 JavaScript로 문항을 만들지만 WeasyPrint는 JS를 실행하지 않으므로,
// PDF를 만들 때만 문항을 정적 HTML로 펼친 임시 파일을 사용한다.
import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourcePath = resolve(root, "omr-answer-sheet-25.html");
const outputPath = resolve(
  process.argv[2] || resolve(root, "OMR 답안지 22문항+단답형5문항.pdf")
);
const source = readFileSync(sourcePath, "utf8");
const templateMatch = source.match(
  /<template id="answer-sheet">([\s\S]*?)<\/template>/
);
if (!templateMatch) throw new Error("답지 템플릿을 찾지 못했습니다.");

const omrRows = (start) =>
  Array.from({ length: 11 }, (_, index) => {
    const no = start + index;
    const bubbles = [1, 2, 3, 4, 5]
      .map(
        (choice) =>
          `<span class="bubble-wrap"><span class="bubble">${choice}</span></span>`
      )
      .join("");
    return `<div class="omr-row"><span class="qno">${no}</span>${bubbles}</div>`;
  })
  .join("");

const shortRows = Array.from(
  { length: 5 },
  (_, index) =>
    `<div class="short-row"><span class="short-no">${
      1 + index
    }</span><span class="short-answer"></span></div>`
).join("");

const makeSheet = () =>
  templateMatch[1]
    .replace(
      '<div class="omr-column" data-start="1"></div>',
      `<div class="omr-column" data-start="1">${omrRows(1)}</div>`
    )
    .replace(
      '<div class="omr-column" data-start="12"></div>',
      `<div class="omr-column" data-start="12">${omrRows(12)}</div>`
    )
    .replace('<div class="short-list"></div>', `<div class="short-list">${shortRows}</div>`);

const staticHtml = source
  .replace('<main class="page" id="page"></main>', `<main class="page">${makeSheet()}${makeSheet()}</main>`)
  .replace(/\s*<template id="answer-sheet">[\s\S]*?<\/template>/, "")
  .replace(/\s*<script>[\s\S]*?<\/script>/, "");

const temporaryPath = resolve(tmpdir(), `dubco-omr-${process.pid}.html`);
writeFileSync(temporaryPath, staticHtml, "utf8");
try {
  const result = spawnSync("weasyprint", [temporaryPath, outputPath], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`PDF 생성 실패 (종료 코드 ${result.status ?? "알 수 없음"})`);
  }
  console.log(outputPath);
} finally {
  unlinkSync(temporaryPath);
}
