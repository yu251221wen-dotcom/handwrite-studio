import assert from "node:assert/strict";
import test from "node:test";

import { API_BASE_URL, apiAssetBlob, apiFetch, resetApiSessionForTests } from "../lib/api/client.ts";

test("API client replaces an expired anonymous session and retries once", async () => {
  const values = new Map<string, string>([["handwrite-studio-session-v3", "stale-session"]]);
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const seenSessions: string[] = [];
  let refreshes = 0;

  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  } });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/session")) {
      refreshes += 1;
      return Response.json({ sessionId: "fresh-session" });
    }
    const session = new Headers(init?.headers).get("X-Session-ID") ?? "";
    seenSessions.push(session);
    return session === "fresh-session" ? Response.json([{ id: "font-1" }]) : new Response("expired", { status: 401 });
  };

  try {
    const response = await apiFetch("/api/fonts");
    assert.equal(response.status, 200);
    assert.equal(refreshes, 1);
    assert.deepEqual(seenSessions, ["stale-session", "fresh-session"]);
    assert.equal(values.get("handwrite-studio-session-v3"), "fresh-session");
  } finally {
    resetApiSessionForTests();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete (globalThis as { window?: Window }).window;
    else Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("API client recovers from one transient public session connection failure", async () => {
  const values = new Map<string, string>();
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  let sessionAttempts = 0;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  } });
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/api/session")) {
      sessionAttempts += 1;
      if (sessionAttempts === 1) throw new TypeError("transient public connection failure");
      return Response.json({ sessionId: "recovered-session" });
    }
    return Response.json([]);
  };
  try {
    assert.equal((await apiFetch("/api/backgrounds")).status, 200);
    assert.equal(sessionAttempts, 2);
    assert.equal(values.get("handwrite-studio-session-v3"), "recovered-session");
  } finally {
    resetApiSessionForTests();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete (globalThis as { window?: Window }).window;
    else Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("uploaded background bytes retry once and reject third-party resource origins", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) throw new TypeError("cold start");
    return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "Content-Type": "image/png" } });
  };
  try {
    const blob = await apiAssetBlob(`${API_BASE_URL}/api/backgrounds/bg/file?session=test`);
    assert.equal(blob.type, "image/png");
    assert.equal(attempts, 2);
    await assert.rejects(() => apiAssetBlob("https://untrusted.example/paper.png"), /不属于当前 API/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
