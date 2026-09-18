// 아주 단순한 메모리 기반 시도 제한. (한 서버 프로세스 기준)
// 로그인 무차별 대입을 늦추는 용도 — 완벽한 방어가 아니라 "속도 제한"이다.
type Bucket = { count: number; first: number; blockedUntil: number };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 10 * 60 * 1000; // 10분
const MAX_FAILS = 10; // 10분에 10번 실패하면
const BLOCK_MS = 10 * 60 * 1000; // 10분 잠금

function prune(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, b] of buckets) {
    if (now - b.first > WINDOW_MS && b.blockedUntil < now) buckets.delete(k);
  }
}

/** 잠겨 있으면 남은 초, 아니면 0 */
export function blockedSeconds(key: string): number {
  const b = buckets.get(key);
  if (!b) return 0;
  const now = Date.now();
  if (b.blockedUntil > now) return Math.ceil((b.blockedUntil - now) / 1000);
  return 0;
}

/** 로그인 실패 기록. 한도를 넘으면 잠근다. */
export function recordFailure(key: string) {
  const now = Date.now();
  prune(now);
  const b = buckets.get(key);
  if (!b || now - b.first > WINDOW_MS) {
    buckets.set(key, { count: 1, first: now, blockedUntil: 0 });
    return;
  }
  b.count += 1;
  if (b.count >= MAX_FAILS) {
    b.blockedUntil = now + BLOCK_MS;
    b.count = 0;
    b.first = now;
  }
}

/** 로그인 성공 시 기록 삭제 */
export function clearFailures(key: string) {
  buckets.delete(key);
}

/** 요청자 IP (프록시 뒤에서도 최대한) */
export function clientIp(req: Request): string {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}
