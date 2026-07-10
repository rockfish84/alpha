// 클라이언트 fetch 래퍼. 실패 시 서버가 준 error 메시지로 throw.

async function handle(res: Response) {
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    const msg = data?.error || `요청 실패 (${res.status})`;
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (url: string) => fetch(url, { cache: "no-store" }).then(handle),
  post: (url: string, body?: unknown) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    }).then(handle),
  patch: (url: string, body?: unknown) =>
    fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    }).then(handle),
  put: (url: string, body?: unknown) =>
    fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    }).then(handle),
  del: (url: string) => fetch(url, { method: "DELETE" }).then(handle),
};
