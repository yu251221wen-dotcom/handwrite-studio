const configuredBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
export const API_BASE_URL = (configuredBase || "http://127.0.0.1:8000").replace(/\/$/, "");

const SESSION_KEY = "handwrite-studio-session-v3";
let sessionPromise: Promise<string> | undefined;

export async function getSessionId(): Promise<string> {
  if (typeof window === "undefined") return "";
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  sessionPromise ??= fetch(`${API_BASE_URL}/api/session`, { method: "POST" }).then(async (response) => {
    if (!response.ok) throw new Error("无法建立私密会话");
    const result = await response.json() as { sessionId: string };
    window.sessionStorage.setItem(SESSION_KEY, result.sessionId);
    return result.sessionId;
  }).finally(() => { sessionPromise = undefined; });
  return sessionPromise;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const sessionId = await getSessionId();
  const headers = new Headers(init.headers);
  if (sessionId) headers.set("X-Session-ID", sessionId);
  return fetch(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, { ...init, headers });
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { detail?: string };
    throw new Error(detail.detail ?? `请求失败 (${response.status})`);
  }
  return response.json() as Promise<T>;
}
