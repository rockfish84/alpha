// pdf.js 워커를 public/ 으로 복사한다 (문항 잘라 보기 기능에서 사용).
// node_modules 에서 가져오므로 저장소에는 워커 파일을 넣지 않는다.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const dest = join(root, "public/pdf.worker.min.mjs");

if (!existsSync(src)) {
  console.warn("[copy-pdf-worker] pdfjs-dist 가 없어 건너뜁니다:", src);
  process.exit(0);
}
try {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log("[copy-pdf-worker] public/pdf.worker.min.mjs 준비 완료");
} catch (e) {
  // 복사에 실패해도 빌드는 계속한다 (문항 잘라 보기만 동작하지 않음)
  console.warn("[copy-pdf-worker] 복사 실패:", e?.message ?? e);
}
