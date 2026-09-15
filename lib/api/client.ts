const configuredBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
export const API_BASE_URL = (configuredBase || "http://127.0.0.1:8000").replace(/\/$/, "");

const SESSION_KEY = "handwrite-studio-session-v3";
let sessionPromise: Promise<string> | undefined;
let sessionRefreshPromise: Promise<string> | undefined;

async function createSessionRequest(): Promise<string> {
  const request = async () => {
    const response = await fetch(`${API_BASE_URL}/api/session`, { method: "POST" });
    if (!response.ok) throw new Error("无法建立私密会话");
    return (await response.json() as { sessionId: string }).sessionId;
  };
  try { return await request(); }
  catch { return request(); }
}

export async function getSessionId(): Promise<string> {
  if (typeof window === "undefined") return "";
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  sessionPromise ??= createSessionRequest().then((sessionId) => {
    window.sessionStorage.setItem(SESSION_KEY, sessionId);
    return sessionId;
  }).finally(() => { sessionPromise = undefined; });
  return sessionPromise;
}

async function refreshSession(staleSessionId: string): Promise<string> {
  if (typeof window === "undefined") return "";
  const current = window.sessionStorage.getItem(SESSION_KEY);
  if (current && current !== staleSessionId) return current;
  sessionRefreshPromise ??= (async () => {
    if (window.sessionStorage.getItem(SESSION_KEY) === staleSessionId) {
      window.sessionStorage.removeItem(SESSION_KEY);
    }
    sessionPromise = undefined;
    return getSessionId();
  })().finally(() => { sessionRefreshPromise = undefined; });
  return sessionRefreshPromise;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const sessionId = await getSessionId();
  const request = (activeSessionId: string) => {
    const headers = new Headers(init.headers);
    if (activeSessionId) headers.set("X-Session-ID", activeSessionId);
    return fetch(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, { ...init, headers });
  };
  let response: Response;
  try { response = await request(sessionId); }
  catch {
    if (typeof window === "undefined") throw new Error("API 网络连接失败");
    return request(await refreshSession(sessionId));
  }
  if (response.status !== 401 || typeof window === "undefined") return response;
  return request(await refreshSession(sessionId));
}

export async function apiAssetBlob(url: string): Promise<Blob> {
  const target = new URL(url, API_BASE_URL);
  if (target.origin !== new URL(API_BASE_URL).origin) throw new Error("资源地址不属于当前 API");
  let response: Response;
  try { response = await fetch(target, { mode: "cors" }); }
  catch { response = await fetch(target, { mode: "cors" }); }
  if (!response.ok) throw new Error(`背景资源读取失败 (${response.status})`);
  return response.blob();
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { detail?: string };
    throw new Error(detail.detail ?? `请求失败 (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function resetApiSessionForTests(): void {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(SESSION_KEY);
  sessionPromise = undefined;
  sessionRefreshPromise = undefined;
}
